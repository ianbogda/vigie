-- VIGIE 0.0.78 — noms réels des éditions comparatives budgétaires Op@le.
-- Les anciens types YCONSDEP/YCONSREC restent acceptés pour compatibilité avec l'historique déjà importé.
ALTER TABLE financial_snapshots DROP CONSTRAINT IF EXISTS financial_snapshots_source_type_check;
ALTER TABLE financial_snapshots
  ADD CONSTRAINT financial_snapshots_source_type_check
  CHECK (source_type IN ('EBLC','YCONSDEP','YCONSREC','YECBUD','YECBUR','YBALAC','YBALAF'));

CREATE INDEX IF NOT EXISTS financial_snapshots_execution_history
  ON financial_snapshots(opale_entity, source_type, exercise, snapshot_date DESC, created_at DESC);
