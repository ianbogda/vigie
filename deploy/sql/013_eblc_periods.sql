-- EBLC : distinguer la date d'extraction de la période comptable demandée.
ALTER TABLE financial_snapshots ADD COLUMN IF NOT EXISTS period_start text;
ALTER TABLE financial_snapshots ADD COLUMN IF NOT EXISTS period_end text;
ALTER TABLE financial_snapshots ADD COLUMN IF NOT EXISTS technical_exercise int;

-- Régularisation des EBLC déjà importées : l'ancien champ period contenait la période de fin.
UPDATE financial_snapshots
SET period_end = COALESCE(period_end, period)
WHERE source_type = 'EBLC' AND period IS NOT NULL;

-- L'exercice métier d'une EBLC est l'année de sa période de fin.
-- Exemple : édition lancée en 2026, période 01/2025 -> 12/2025 = exercice 2025.
UPDATE financial_snapshots
SET technical_exercise = COALESCE(technical_exercise, exercise),
    exercise = substring(COALESCE(period_end, period) from '(20[0-9]{2})')::int
WHERE source_type = 'EBLC'
  AND COALESCE(period_end, period) ~ '(20[0-9]{2})';

CREATE INDEX IF NOT EXISTS financial_snapshots_eblc_period
ON financial_snapshots(opale_entity, source_type, exercise, period_end, created_at DESC);
