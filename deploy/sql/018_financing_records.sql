CREATE TABLE IF NOT EXISTS financing_records (
  id BIGSERIAL PRIMARY KEY,
  opale_entity TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  funder TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'AUTRE',
  notified_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  start_date DATE,
  expected_end_date DATE,
  closed_at DATE,
  priority BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WATCH','RISK','CLOSED')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financing_records_entity ON financing_records(upper(opale_entity), status);
CREATE TABLE IF NOT EXISTS financing_record_sources (
  id BIGSERIAL PRIMARY KEY,
  financing_id BIGINT NOT NULL REFERENCES financing_records(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('ACCOUNT','CGR')),
  source_value TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'BOTH' CHECK(direction IN ('DEP','REC','BOTH')),
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(financing_id,source_kind,source_value,direction)
);