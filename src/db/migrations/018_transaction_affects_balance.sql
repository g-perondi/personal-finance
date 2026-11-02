ALTER TABLE "transaction" ADD COLUMN affects_balance INTEGER NOT NULL DEFAULT 1
  CHECK (affects_balance IN (0, 1));
