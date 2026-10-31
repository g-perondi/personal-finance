/** SQLite reserved word — always quote in SQL. */
export const TRANSACTION_TABLE = '"transaction"'

export function mapIsoDateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10)
}
