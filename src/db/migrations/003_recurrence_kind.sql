ALTER TABLE "transaction" RENAME COLUMN expense_kind TO recurrence_kind;

ALTER TABLE category ADD COLUMN default_recurrence_kind TEXT CHECK (
  default_recurrence_kind IN ('recurring', 'variable')
);
