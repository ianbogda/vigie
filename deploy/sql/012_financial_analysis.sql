CREATE TABLE IF NOT EXISTS financial_snapshots (
 id bigserial PRIMARY KEY, establishment_name text NOT NULL, opale_entity text NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('EBLC','YCONSDEP','YCONSREC','YBALAC','YBALAF')),
 snapshot_date date NOT NULL DEFAULT current_date, exercise int, period text, source_filename text NOT NULL,
 row_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_snapshots_lookup ON financial_snapshots(opale_entity,source_type,snapshot_date DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS financial_balance_lines (
 snapshot_id bigint NOT NULL REFERENCES financial_snapshots(id) ON DELETE CASCADE, line_no int NOT NULL,
 account text NOT NULL,label text,prior_debit numeric NOT NULL DEFAULT 0,prior_credit numeric NOT NULL DEFAULT 0,
 period_debit numeric NOT NULL DEFAULT 0,period_credit numeric NOT NULL DEFAULT 0,debit numeric NOT NULL DEFAULT 0,credit numeric NOT NULL DEFAULT 0,
 PRIMARY KEY(snapshot_id,line_no)
);
CREATE TABLE IF NOT EXISTS financial_execution_lines (
 snapshot_id bigint NOT NULL REFERENCES financial_snapshots(id) ON DELETE CASCADE,line_no int NOT NULL,
 direction text NOT NULL,section text,service_group text,service text,domain text,activity text,account text,label text,
 budget numeric NOT NULL DEFAULT 0,committed numeric NOT NULL DEFAULT 0,accounted numeric NOT NULL DEFAULT 0,in_progress numeric NOT NULL DEFAULT 0,available numeric NOT NULL DEFAULT 0,
 PRIMARY KEY(snapshot_id,line_no)
);
CREATE TABLE IF NOT EXISTS financial_aged_lines (
 snapshot_id bigint NOT NULL REFERENCES financial_snapshots(id) ON DELETE CASCADE,line_no int NOT NULL,
 account text,account_label text,party_id text,party_label text,piece text,piece_type text,
 before_121 numeric NOT NULL DEFAULT 0,m91_120 numeric NOT NULL DEFAULT 0,m61_90 numeric NOT NULL DEFAULT 0,m46_60 numeric NOT NULL DEFAULT 0,m31_45 numeric NOT NULL DEFAULT 0,m1_30 numeric NOT NULL DEFAULT 0,
 due numeric NOT NULL DEFAULT 0,p1_30 numeric NOT NULL DEFAULT 0,p31_45 numeric NOT NULL DEFAULT 0,p46_60 numeric NOT NULL DEFAULT 0,p61_90 numeric NOT NULL DEFAULT 0,p91_120 numeric NOT NULL DEFAULT 0,p121_plus numeric NOT NULL DEFAULT 0,not_due numeric NOT NULL DEFAULT 0,total numeric NOT NULL DEFAULT 0,
 PRIMARY KEY(snapshot_id,line_no)
);
