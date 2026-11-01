import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import {
  parseCalendarDateForStorage,
  toUtcIsoString,
  utcNowIso,
  type UtcIsoString,
} from '../../lib/datetime'
import { createSimpleTransaction, updateSimpleTransaction } from './transaction'
import type {
  HoldingListItem,
  HoldingPurchaseListItem,
  HoldingRecord,
  InstrumentAssetKind,
} from './model'
import {
  getCachedQuoteCents,
  getStaleCachedQuoteCents,
  upsertInstrument,
  type UpsertInstrumentInput,
} from './instrument'
import { TRANSACTION_TABLE } from './sql'

function mapHoldingRow(row: Record<string, unknown>): HoldingRecord {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    instrumentId: String(row.instrument_id),
    quantity: Number(row.quantity),
    totalCostCents: Number(row.total_cost_cents),
    updatedAt: toUtcIsoString(String(row.updated_at)),
  }
}

const HOLDING_LIST_SELECT = `
  SELECT
    h.id,
    h.account_id,
    h.instrument_id,
    h.quantity,
    h.total_cost_cents,
    h.updated_at,
    i.name AS instrument_name,
    i.isin AS instrument_isin,
    i.asset_kind AS instrument_asset_kind,
    i.quote_symbol,
    a.name AS account_name
  FROM holding h
  INNER JOIN instrument i ON i.id = h.instrument_id
  INNER JOIN account a ON a.id = h.account_id
`

function parseAssetKind(raw: unknown): InstrumentAssetKind {
  const value = String(raw)
  if (value === 'equity' || value === 'crypto') {
    return value
  }
  return 'etf'
}

export type ListHoldingsOptions = {
  accountId?: string
}

export function listHoldings(
  db: Database,
  options: ListHoldingsOptions = {},
): HoldingListItem[] {
  const clauses: string[] = []
  const params: string[] = []
  if (options.accountId) {
    clauses.push('h.account_id = ?')
    params.push(options.accountId)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const sql = `${HOLDING_LIST_SELECT} ${where} ORDER BY i.name COLLATE NOCASE ASC`
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: HoldingListItem[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    rows.push({
      ...mapHoldingRow(row),
      instrumentName: String(row.instrument_name),
      instrumentIsin: row.instrument_isin == null ? null : String(row.instrument_isin),
      instrumentAssetKind: parseAssetKind(row.instrument_asset_kind),
      quoteSymbol: String(row.quote_symbol),
      accountName: String(row.account_name),
    })
  }
  stmt.free()
  return rows
}

export function countOpenHoldings(db: Database): number {
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM holding')
  stmt.step()
  const count = Number(stmt.getAsObject().count)
  stmt.free()
  return count
}

export function getHoldingById(db: Database, id: string): HoldingRecord | null {
  const stmt = db.prepare(`SELECT * FROM holding WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapHoldingRow(stmt.getAsObject())
  stmt.free()
  return row
}

function findHoldingByAccountInstrument(
  db: Database,
  accountId: string,
  instrumentId: string,
): HoldingRecord | null {
  const stmt = db.prepare(
    `SELECT * FROM holding WHERE account_id = ? AND instrument_id = ? LIMIT 1`,
  )
  stmt.bind([accountId, instrumentId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapHoldingRow(stmt.getAsObject())
  stmt.free()
  return row
}

function insertHolding(
  db: Database,
  accountId: string,
  instrumentId: string,
  quantity: number,
  totalCostCents: number,
): HoldingRecord {
  const id = newId()
  const updatedAt = utcNowIso()
  db.run(
    `INSERT INTO holding (id, account_id, instrument_id, quantity, total_cost_cents, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, accountId, instrumentId, quantity, totalCostCents, updatedAt],
  )
  return getHoldingById(db, id)!
}

function applyPurchaseToHolding(
  db: Database,
  holdingId: string,
  amountCents: number,
  quantity: number,
): void {
  if (quantity <= 0 || amountCents <= 0) {
    throw new Error('Amount and quantity must be greater than zero.')
  }
  const holding = getHoldingById(db, holdingId)
  if (!holding) {
    throw new Error('Holding not found.')
  }
  const newQty = holding.quantity + quantity
  const newCost = holding.totalCostCents + amountCents
  if (newQty <= 0 || newCost <= 0) {
    throw new Error('Invalid holding totals after purchase.')
  }
  db.run(
    `UPDATE holding SET quantity = ?, total_cost_cents = ?, updated_at = ? WHERE id = ?`,
    [newQty, newCost, utcNowIso(), holdingId],
  )
}

function getHoldingPurchaseByTransactionId(
  db: Database,
  transactionId: string,
): {
  id: string
  holdingId: string
  amountCents: number
  quantity: number
} | null {
  const stmt = db.prepare(
    `SELECT id, holding_id, amount_cents, quantity
     FROM holding_purchase
     WHERE transaction_id = ?
     LIMIT 1`,
  )
  stmt.bind([transactionId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return {
    id: String(row.id),
    holdingId: String(row.holding_id),
    amountCents: Number(row.amount_cents),
    quantity: Number(row.quantity),
  }
}

function reverseSinglePurchaseFromHolding(
  db: Database,
  purchase: {
    id: string
    holdingId: string
    amountCents: number
    quantity: number
  },
): void {
  const holding = getHoldingById(db, purchase.holdingId)
  db.run(`DELETE FROM holding_purchase WHERE id = ?`, [purchase.id])

  if (!holding) {
    return
  }

  const newQty = holding.quantity - purchase.quantity
  const newCost = holding.totalCostCents - purchase.amountCents
  if (newQty <= 1e-9 || newCost <= 0) {
    db.run(`DELETE FROM holding WHERE id = ?`, [holding.id])
    return
  }

  db.run(
    `UPDATE holding SET quantity = ?, total_cost_cents = ?, updated_at = ? WHERE id = ?`,
    [newQty, newCost, utcNowIso(), holding.id],
  )
}

function getHoldingPurchaseDetail(
  db: Database,
  purchaseId: string,
): {
  id: string
  holdingId: string
  transactionId: string | null
  amountCents: number
  priceCentsPerUnit: number
  quantity: number
  accountId: string
  instrumentName: string
} | null {
  const stmt = db.prepare(
    `SELECT
      p.id,
      p.holding_id,
      p.transaction_id,
      p.amount_cents,
      p.price_cents_per_unit,
      p.quantity,
      h.account_id,
      i.name AS instrument_name
     FROM holding_purchase p
     INNER JOIN holding h ON h.id = p.holding_id
     INNER JOIN instrument i ON i.id = h.instrument_id
     WHERE p.id = ?
     LIMIT 1`,
  )
  stmt.bind([purchaseId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return {
    id: String(row.id),
    holdingId: String(row.holding_id),
    transactionId: row.transaction_id == null ? null : String(row.transaction_id),
    amountCents: Number(row.amount_cents),
    priceCentsPerUnit: Number(row.price_cents_per_unit),
    quantity: Number(row.quantity),
    accountId: String(row.account_id),
    instrumentName: String(row.instrument_name),
  }
}

/** Undo portfolio purchase linked to a ledger `investment` row before deleting the transaction. */
export function reverseHoldingPurchaseForTransaction(
  db: Database,
  transactionId: string,
): void {
  const purchase = getHoldingPurchaseByTransactionId(db, transactionId)
  if (!purchase) {
    return
  }
  reverseSinglePurchaseFromHolding(db, purchase)
}

export type UpdateHoldingPurchaseInput = {
  purchaseDate: string
  amountCents: number
  priceCentsPerUnit: number
}

export function updateHoldingPurchase(
  db: Database,
  purchaseId: string,
  input: UpdateHoldingPurchaseInput,
): void {
  if (input.amountCents <= 0) {
    throw new Error('Amount must be greater than zero.')
  }
  if (input.priceCentsPerUnit <= 0) {
    throw new Error('Price per unit must be greater than zero.')
  }
  const newQuantity = input.amountCents / input.priceCentsPerUnit
  if (newQuantity <= 0) {
    throw new Error('Calculated quantity must be greater than zero.')
  }

  const purchase = getHoldingPurchaseDetail(db, purchaseId)
  if (!purchase) {
    throw new Error('Purchase not found.')
  }

  const holding = getHoldingById(db, purchase.holdingId)
  if (!holding) {
    throw new Error('Holding not found.')
  }

  const newQty = holding.quantity - purchase.quantity + newQuantity
  const newCost = holding.totalCostCents - purchase.amountCents + input.amountCents
  if (newQty <= 1e-9 || newCost <= 0) {
    throw new Error('Edit would remove or zero out the position.')
  }

  const purchaseDate = parseCalendarDateForStorage(input.purchaseDate)
  db.run(
    `UPDATE holding_purchase
     SET purchase_date = ?, amount_cents = ?, price_cents_per_unit = ?, quantity = ?
     WHERE id = ?`,
    [purchaseDate, input.amountCents, input.priceCentsPerUnit, newQuantity, purchaseId],
  )
  db.run(
    `UPDATE holding SET quantity = ?, total_cost_cents = ?, updated_at = ? WHERE id = ?`,
    [newQty, newCost, utcNowIso(), holding.id],
  )

  if (purchase.transactionId) {
    updateSimpleTransaction(db, purchase.transactionId, {
      accountId: purchase.accountId,
      kind: 'investment',
      amountCents: input.amountCents,
      transactionDate: input.purchaseDate,
      description: purchase.instrumentName,
      categoryId: null,
      recurrenceKind: 'variable',
    })
  }

  schedulePersist()
}

/** Removes one purchase, updates the holding, and deletes a linked investment transaction when present. */
export function deleteHoldingPurchase(db: Database, purchaseId: string): void {
  const purchase = getHoldingPurchaseDetail(db, purchaseId)
  if (!purchase) {
    throw new Error('Purchase not found.')
  }

  reverseSinglePurchaseFromHolding(db, purchase)

  if (purchase.transactionId) {
    db.run(`DELETE FROM ${TRANSACTION_TABLE} WHERE id = ?`, [purchase.transactionId])
  }

  schedulePersist()
}

export type CreateOpeningHoldingInput = {
  accountId: string
  instrument: UpsertInstrumentInput
  openingDate: string
  quantity: number
  priceCentsPerUnit: number
  /** When true, posts an `investment` transaction on the account (cashflow + balance). */
  recordInvestmentTransaction?: boolean
}

export function createOpeningHolding(
  db: Database,
  input: CreateOpeningHoldingInput,
): HoldingRecord {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.')
  }
  if (input.priceCentsPerUnit <= 0) {
    throw new Error('Price per unit must be greater than zero.')
  }
  const totalCostCents = Math.round(input.quantity * input.priceCentsPerUnit)
  if (totalCostCents <= 0) {
    throw new Error('Cost basis must be greater than zero.')
  }
  const instrument = upsertInstrument(db, input.instrument)
  const existing = findHoldingByAccountInstrument(db, input.accountId, instrument.id)
  if (existing) {
    throw new Error('A holding already exists for this account and instrument.')
  }

  const purchaseDate = parseCalendarDateForStorage(input.openingDate)
  const holding = insertHolding(
    db,
    input.accountId,
    instrument.id,
    input.quantity,
    totalCostCents,
  )

  let transactionId: string | null = null
  if (input.recordInvestmentTransaction) {
    const tx = createSimpleTransaction(db, {
      accountId: input.accountId,
      kind: 'investment',
      amountCents: totalCostCents,
      transactionDate: input.openingDate,
      description: instrument.name,
      categoryId: null,
      recurrenceKind: 'variable',
    })
    transactionId = tx.id
  }

  const purchaseId = newId()
  const createdAt = utcNowIso()
  db.run(
    `INSERT INTO holding_purchase (
      id, holding_id, transaction_id, purchase_date, amount_cents,
      price_cents_per_unit, quantity, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      purchaseId,
      holding.id,
      transactionId,
      purchaseDate,
      totalCostCents,
      input.priceCentsPerUnit,
      input.quantity,
      createdAt,
    ],
  )
  schedulePersist()
  return getHoldingById(db, holding.id)!
}

export type RecordHoldingPurchaseInput = {
  accountId: string
  instrument: UpsertInstrumentInput
  purchaseDate: string
  amountCents: number
  priceCentsPerUnit: number
  description?: string | null
}

export function recordHoldingPurchase(
  db: Database,
  input: RecordHoldingPurchaseInput,
): HoldingRecord {
  if (input.amountCents <= 0) {
    throw new Error('Amount must be greater than zero.')
  }
  if (input.priceCentsPerUnit <= 0) {
    throw new Error('Price per unit must be greater than zero.')
  }
  const quantity = input.amountCents / input.priceCentsPerUnit
  if (quantity <= 0) {
    throw new Error('Calculated quantity must be greater than zero.')
  }

  const instrument = upsertInstrument(db, input.instrument)
  let holding = findHoldingByAccountInstrument(db, input.accountId, instrument.id)
  if (!holding) {
    holding = insertHolding(
      db,
      input.accountId,
      instrument.id,
      quantity,
      input.amountCents,
    )
  } else {
    applyPurchaseToHolding(db, holding.id, input.amountCents, quantity)
    holding = getHoldingById(db, holding.id)!
  }

  const purchaseDate = parseCalendarDateForStorage(input.purchaseDate)
  const tx = createSimpleTransaction(db, {
    accountId: input.accountId,
    kind: 'investment',
    amountCents: input.amountCents,
    transactionDate: input.purchaseDate,
    description: input.description?.trim() || instrument.name,
    categoryId: null,
    recurrenceKind: 'variable',
  })

  const purchaseId = newId()
  db.run(
    `INSERT INTO holding_purchase (
      id, holding_id, transaction_id, purchase_date, amount_cents,
      price_cents_per_unit, quantity, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      purchaseId,
      holding.id,
      tx.id,
      purchaseDate,
      input.amountCents,
      input.priceCentsPerUnit,
      quantity,
      utcNowIso(),
    ],
  )
  schedulePersist()
  return getHoldingById(db, holding.id)!
}

export function deleteHolding(db: Database, holdingId: string): void {
  if (!getHoldingById(db, holdingId)) {
    throw new Error('Holding not found.')
  }
  db.run(`DELETE FROM holding WHERE id = ?`, [holdingId])
  schedulePersist()
}

export function listRecentHoldingPurchases(
  db: Database,
  limit = 20,
): HoldingPurchaseListItem[] {
  const stmt = db.prepare(
    `SELECT
      p.id,
      p.holding_id,
      p.transaction_id,
      p.purchase_date,
      p.amount_cents,
      p.price_cents_per_unit,
      p.quantity,
      p.created_at,
      h.account_id,
      i.name AS instrument_name,
      i.isin AS instrument_isin,
      i.quote_symbol,
      i.asset_kind AS instrument_asset_kind,
      a.name AS account_name
     FROM holding_purchase p
     INNER JOIN holding h ON h.id = p.holding_id
     INNER JOIN instrument i ON i.id = h.instrument_id
     INNER JOIN account a ON a.id = h.account_id
     ORDER BY p.purchase_date DESC, p.created_at DESC
     LIMIT ?`,
  )
  stmt.bind([limit])
  const rows: HoldingPurchaseListItem[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    rows.push({
      id: String(row.id),
      holdingId: String(row.holding_id),
      transactionId: row.transaction_id == null ? null : String(row.transaction_id),
      purchaseDate: toUtcIsoString(String(row.purchase_date)) as UtcIsoString,
      amountCents: Number(row.amount_cents),
      priceCentsPerUnit: Number(row.price_cents_per_unit),
      quantity: Number(row.quantity),
      createdAt: toUtcIsoString(String(row.created_at)),
      accountId: String(row.account_id),
      instrumentName: String(row.instrument_name),
      instrumentIsin: row.instrument_isin == null ? null : String(row.instrument_isin),
      quoteSymbol: String(row.quote_symbol),
      instrumentAssetKind: parseAssetKind(row.instrument_asset_kind),
      accountName: String(row.account_name),
    })
  }
  stmt.free()
  return rows
}

export function computePortfolioTotals(
  holdings: HoldingListItem[],
  priceByInstrumentId: Map<string, number>,
): {
  costBasisCents: number
  marketValueCents: number | null
  missingQuotes: number
} {
  let costBasisCents = 0
  let marketValueCents = 0
  let missingQuotes = 0
  for (const holding of holdings) {
    costBasisCents += holding.totalCostCents
    const priceEur = priceByInstrumentId.get(holding.instrumentId)
    if (priceEur === undefined) {
      missingQuotes += 1
      continue
    }
    marketValueCents += Math.round(holding.quantity * priceEur * 100)
  }
  return {
    costBasisCents,
    marketValueCents: missingQuotes === holdings.length ? null : marketValueCents,
    missingQuotes,
  }
}

/** Per account: market value from cached quotes, or `null` if the account has holdings but no usable quotes. */
export function getHoldingsMarketValueCentsByAccountId(
  db: Database,
): Map<string, number | null> {
  const holdings = listHoldings(db, {})
  const byAccount = new Map<
    string,
    { marketValueCents: number; missingQuotes: number; holdingCount: number }
  >()
  for (const holding of holdings) {
    const entry = byAccount.get(holding.accountId) ?? {
      marketValueCents: 0,
      missingQuotes: 0,
      holdingCount: 0,
    }
    entry.holdingCount += 1
    const fresh = getCachedQuoteCents(db, holding.instrumentId)
    const cached = fresh ?? getStaleCachedQuoteCents(db, holding.instrumentId)
    if (!cached) {
      entry.missingQuotes += 1
    } else {
      entry.marketValueCents += Math.round(
        holding.quantity * (cached.priceCentsPerUnit / 100) * 100,
      )
    }
    byAccount.set(holding.accountId, entry)
  }
  const result = new Map<string, number | null>()
  for (const [accountId, entry] of byAccount) {
    result.set(
      accountId,
      entry.missingQuotes === entry.holdingCount ? null : entry.marketValueCents,
    )
  }
  return result
}

/** Sum of `holding.total_cost_cents` per account (portfolio cost basis, not investment transactions). */
export function getHoldingsCostCentsByAccountId(db: Database): Map<string, number> {
  const stmt = db.prepare(`
    SELECT account_id, COALESCE(SUM(total_cost_cents), 0) AS cost_cents
    FROM holding
    GROUP BY account_id
  `)
  const map = new Map<string, number>()
  while (stmt.step()) {
    const row = stmt.getAsObject()
    map.set(String(row.account_id), Number(row.cost_cents))
  }
  stmt.free()
  return map
}
