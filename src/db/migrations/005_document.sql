CREATE TABLE document_category (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE document (
  id TEXT PRIMARY KEY NOT NULL,
  document_category_id TEXT REFERENCES document_category (id) ON DELETE SET NULL,
  reference_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  document_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_document_reference_year ON document (reference_year);

CREATE INDEX idx_document_category_id ON document (document_category_id);
