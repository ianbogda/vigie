-- VIGIE 0.0.79 — conservation fidèle des dimensions YECBUD / YECBUR
ALTER TABLE financial_execution_lines ADD COLUMN IF NOT EXISTS cgr_path jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE financial_execution_lines ADD COLUMN IF NOT EXISTS post_path jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE financial_execution_lines ADD COLUMN IF NOT EXISTS amount_labels jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE financial_execution_lines ADD COLUMN IF NOT EXISTS extra_amounts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS financial_execution_lines_cgr_path_gin ON financial_execution_lines USING gin(cgr_path);
CREATE INDEX IF NOT EXISTS financial_execution_lines_post_path_gin ON financial_execution_lines USING gin(post_path);
CREATE INDEX IF NOT EXISTS financial_snapshots_execution_year ON financial_snapshots(opale_entity,source_type,exercise,created_at DESC);