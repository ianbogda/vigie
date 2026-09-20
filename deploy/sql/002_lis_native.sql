alter table balance_snapshots add column if not exists source_format text;
alter table balance_snapshots add column if not exists opale_entity text;
alter table balance_snapshots add column if not exists opale_entity_label text;
alter table balance_lines add column if not exists prior_debit numeric(16,2) not null default 0;
alter table balance_lines add column if not exists prior_credit numeric(16,2) not null default 0;
alter table balance_lines add column if not exists period_debit numeric(16,2) not null default 0;
alter table balance_lines add column if not exists period_credit numeric(16,2) not null default 0;
