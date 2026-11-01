import type { Database } from 'sql.js'
import { schedulePersist } from '../database'
import { utcNowIso } from '../../lib/datetime'

export type DateFormatKey =
  'dd_slash_mm_yyyy' | 'mm_slash_dd_yyyy' | 'yyyy_dash_mm_dash_dd' | 'd_mmm_yyyy'

export type NumberFormatKey = 'comma_decimal' | 'dot_decimal'

export type AppSettings = {
  dateFormat: DateFormatKey
  numberFormat: NumberFormatKey
  displayTimeZone: string
  investmentsEnabled: boolean
  documentsEnabled: boolean
  dataDirectoryPath: string | null
}

const KEY_DATE_FORMAT = 'date_format'
const KEY_NUMBER_FORMAT = 'number_format'
const KEY_DISPLAY_TIME_ZONE = 'display_time_zone'
const KEY_INVESTMENTS_ENABLED = 'investments_enabled'
const KEY_DOCUMENTS_ENABLED = 'documents_enabled'
const KEY_DATA_DIRECTORY_PATH = 'data_directory_path'

const DEFAULTS: AppSettings = {
  dateFormat: 'dd_slash_mm_yyyy',
  numberFormat: 'comma_decimal',
  displayTimeZone: 'Europe/Rome',
  investmentsEnabled: true,
  documentsEnabled: true,
  dataDirectoryPath: null,
}

function getRaw(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM app_setting WHERE key = ? LIMIT 1')
  stmt.bind([key])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject() as { value?: unknown }
  stmt.free()
  return row.value == null ? null : String(row.value)
}

function setRaw(db: Database, key: string, value: string): void {
  const now = utcNowIso()
  db.run(
    `INSERT INTO app_setting (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  )
}

function parseDateFormat(value: string): DateFormatKey {
  if (
    value === 'dd_slash_mm_yyyy' ||
    value === 'mm_slash_dd_yyyy' ||
    value === 'yyyy_dash_mm_dash_dd' ||
    value === 'd_mmm_yyyy'
  ) {
    return value
  }
  return DEFAULTS.dateFormat
}

function parseNumberFormat(value: string): NumberFormatKey {
  if (value === 'comma_decimal' || value === 'dot_decimal') {
    return value
  }
  return DEFAULTS.numberFormat
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'boolean') {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return fallback
}

export function loadAppSettings(db: Database): AppSettings {
  const dateFormatRaw = getRaw(db, KEY_DATE_FORMAT)
  const numberFormatRaw = getRaw(db, KEY_NUMBER_FORMAT)
  const timeZoneRaw = getRaw(db, KEY_DISPLAY_TIME_ZONE)
  const investmentsRaw = getRaw(db, KEY_INVESTMENTS_ENABLED)
  const documentsRaw = getRaw(db, KEY_DOCUMENTS_ENABLED)
  const dataDirRaw = getRaw(db, KEY_DATA_DIRECTORY_PATH)

  const hasAny =
    dateFormatRaw !== null ||
    numberFormatRaw !== null ||
    timeZoneRaw !== null ||
    investmentsRaw !== null ||
    documentsRaw !== null ||
    dataDirRaw !== null

  if (!hasAny) {
    writeAppSettings(db, DEFAULTS)
    return { ...DEFAULTS }
  }

  return {
    dateFormat: dateFormatRaw ? parseDateFormat(dateFormatRaw) : DEFAULTS.dateFormat,
    numberFormat: numberFormatRaw
      ? parseNumberFormat(numberFormatRaw)
      : DEFAULTS.numberFormat,
    displayTimeZone: timeZoneRaw?.trim() || DEFAULTS.displayTimeZone,
    investmentsEnabled: investmentsRaw
      ? parseBoolean(investmentsRaw, DEFAULTS.investmentsEnabled)
      : DEFAULTS.investmentsEnabled,
    documentsEnabled: documentsRaw
      ? parseBoolean(documentsRaw, DEFAULTS.documentsEnabled)
      : DEFAULTS.documentsEnabled,
    dataDirectoryPath: dataDirRaw?.trim() ? dataDirRaw.trim() : null,
  }
}

export function writeAppSettings(db: Database, settings: AppSettings): void {
  setRaw(db, KEY_DATE_FORMAT, settings.dateFormat)
  setRaw(db, KEY_NUMBER_FORMAT, settings.numberFormat)
  setRaw(db, KEY_DISPLAY_TIME_ZONE, settings.displayTimeZone)
  setRaw(db, KEY_INVESTMENTS_ENABLED, JSON.stringify(settings.investmentsEnabled))
  setRaw(db, KEY_DOCUMENTS_ENABLED, JSON.stringify(settings.documentsEnabled))
  setRaw(
    db,
    KEY_DATA_DIRECTORY_PATH,
    settings.dataDirectoryPath == null ? '' : settings.dataDirectoryPath,
  )
  schedulePersist()
}

export type AppSettingPatch = Partial<AppSettings>

export function patchAppSettings(db: Database, patch: AppSettingPatch): AppSettings {
  const current = loadAppSettings(db)
  const next: AppSettings = { ...current, ...patch }
  writeAppSettings(db, next)
  return next
}
