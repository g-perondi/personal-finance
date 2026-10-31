CREATE TABLE document_tag (
  document_id TEXT NOT NULL REFERENCES document (id) ON DELETE CASCADE,
  document_category_id TEXT NOT NULL REFERENCES document_category (id) ON DELETE RESTRICT,
  PRIMARY KEY (document_id, document_category_id)
);

CREATE INDEX idx_document_tag_category ON document_tag (document_category_id);

INSERT INTO document_tag (document_id, document_category_id)
SELECT id, document_category_id
FROM document
WHERE document_category_id IS NOT NULL;

DROP INDEX idx_document_category_id;

ALTER TABLE document DROP COLUMN document_category_id;
