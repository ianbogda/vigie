-- VIGIE 0.0.80 — soldes annuels saisis manuellement pour les exercices sans export OP@LE.
CREATE TABLE IF NOT EXISTS financial_manual_balances (
  id bigserial PRIMARY KEY,
  opale_entity text NOT NULL,
  exercise int NOT NULL CHECK (exercise BETWEEN 2000 AND 2100),
  account text NOT NULL,
  label text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opale_entity, exercise, account)
);
CREATE INDEX IF NOT EXISTS financial_manual_balances_lookup
  ON financial_manual_balances (upper(opale_entity), exercise DESC, account);