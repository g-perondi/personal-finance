-- sql.js WASM build does not ship FTS5; drop legacy virtual tables if present.
DROP TABLE IF EXISTS document_fts;
DROP TABLE IF EXISTS transaction_fts;
