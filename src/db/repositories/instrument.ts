import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { newId } from '../../lib/id'
import { toUtcIsoString, utcNowIso } from '../../lib/datetime'
import type { InstrumentAssetKind, InstrumentRecord } from './model'

function parseAssetKind(raw: unknown): InstrumentAssetKind {
  const value = String(raw)
  if (value === 'equity' || value === 'crypto') {
    return value
  }
  return 'etf'
}

function mapInstrumentRow(row: Record<string, unknown>): InstrumentRecord {
  return {
    id: String(row.id),
    isin: row.isin == null ? null : String(row.isin),
    quoteSymbol: String(row.quote_symbol),
    name: String(row.name),
    assetKind: parseAssetKind(row.asset_kind ?? 'etf'),
    createdAt: toUtcIsoString(String(row.created_at)),
  }
}

export function getInstrumentById(db: Database, id: string): InstrumentRecord | null {
  const stmt = db.prepare(`SELECT * FROM instrument WHERE id = ? LIMIT 1`)
  stmt.bind([id])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapInstrumentRow(stmt.getAsObject())
  stmt.free()
  return row
}

export function findInstrumentByIsin(
  db: Database,
  isin: string,
): InstrumentRecord | null {
  const stmt = db.prepare(`SELECT * FROM instrument WHERE isin = ? LIMIT 1`)
  stmt.bind([isin.toUpperCase()])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = mapInstrumentRow(stmt.getAsObject())
  stmt.free()
  return row
}

export type UpsertInstrumentInput = {
  isin: string | null
  quoteSymbol: string
  name: string
  assetKind: InstrumentAssetKind
}

export function upsertInstrument(
  db: Database,
  input: UpsertInstrumentInput,
): InstrumentRecord {
  const isin = input.isin?.trim().toUpperCase() || null
  const assetKind = input.assetKind
  if (isin) {
    const existing = findInstrumentByIsin(db, isin)
    if (existing) {
      db.run(
        `UPDATE instrument SET quote_symbol = ?, name = ?, asset_kind = ? WHERE id = ?`,
        [input.quoteSymbol.trim(), input.name.trim(), assetKind, existing.id],
      )
      schedulePersist()
      return getInstrumentById(db, existing.id)!
    }
  }

  const bySymbol = db.prepare(
    `SELECT * FROM instrument WHERE quote_symbol = ? COLLATE NOCASE LIMIT 1`,
  )
  bySymbol.bind([input.quoteSymbol.trim()])
  if (bySymbol.step()) {
    const existing = mapInstrumentRow(bySymbol.getAsObject())
    bySymbol.free()
    if (isin && !existing.isin) {
      db.run(`UPDATE instrument SET isin = ?, name = ?, asset_kind = ? WHERE id = ?`, [
        isin,
        input.name.trim(),
        assetKind,
        existing.id,
      ])
    } else if (existing.assetKind !== assetKind) {
      db.run(`UPDATE instrument SET asset_kind = ?, name = ? WHERE id = ?`, [
        assetKind,
        input.name.trim(),
        existing.id,
      ])
    }
    schedulePersist()
    return getInstrumentById(db, existing.id)!
  }
  bySymbol.free()

  const id = newId()
  const createdAt = utcNowIso()
  db.run(
    `INSERT INTO instrument (id, isin, quote_symbol, name, asset_kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, isin, input.quoteSymbol.trim(), input.name.trim(), assetKind, createdAt],
  )
  schedulePersist()
  return getInstrumentById(db, id)!
}

export function listInstruments(db: Database): InstrumentRecord[] {
  const stmt = db.prepare(`SELECT * FROM instrument ORDER BY name COLLATE NOCASE ASC`)
  const rows: InstrumentRecord[] = []
  while (stmt.step()) {
    rows.push(mapInstrumentRow(stmt.getAsObject()))
  }
  stmt.free()
  return rows
}

const QUOTE_CACHE_TTL_MS = 3 * 60 * 1000

export function getCachedQuoteCents(
  db: Database,
  instrumentId: string,
): { priceCentsPerUnit: number; fetchedAt: string } | null {
  const stmt = db.prepare(
    `SELECT price_cents_per_unit, fetched_at FROM instrument_quote_cache WHERE instrument_id = ?`,
  )
  stmt.bind([instrumentId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  const fetchedAt = String(row.fetched_at)
  if (Date.now() - Date.parse(fetchedAt) > QUOTE_CACHE_TTL_MS) {
    return null
  }
  return {
    priceCentsPerUnit: Number(row.price_cents_per_unit),
    fetchedAt,
  }
}

export function setCachedQuoteCents(
  db: Database,
  instrumentId: string,
  priceEur: number,
  fetchedAt: string,
): void {
  const priceCentsPerUnit = priceEur * 100
  db.run(
    `INSERT INTO instrument_quote_cache (instrument_id, price_cents_per_unit, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(instrument_id) DO UPDATE SET
       price_cents_per_unit = excluded.price_cents_per_unit,
       fetched_at = excluded.fetched_at`,
    [instrumentId, priceCentsPerUnit, fetchedAt],
  )
  schedulePersist()
}

export function getStaleCachedQuoteCents(
  db: Database,
  instrumentId: string,
): { priceCentsPerUnit: number; fetchedAt: string } | null {
  const stmt = db.prepare(
    `SELECT price_cents_per_unit, fetched_at FROM instrument_quote_cache WHERE instrument_id = ?`,
  )
  stmt.bind([instrumentId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject()
  stmt.free()
  return {
    priceCentsPerUnit: Number(row.price_cents_per_unit),
    fetchedAt: String(row.fetched_at),
  }
}
