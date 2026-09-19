create table if not exists accounting_imports(
 id bigserial primary key,
 opale_entity text not null,
 source_filename text not null,
 source_format text not null default 'opale-accounting-monthly-summary',
 source_row_count integer not null default 0,
 imported_row_count integer not null default 0,
 added_count integer not null default 0,
 updated_count integer not null default 0,
 unchanged_count integer not null default 0,
 period_from date,
 period_to date,
 created_at timestamptz not null default now()
);
create table if not exists accounting_lines(
 id bigserial primary key,
 opale_entity text not null,
 period text not null,
 period_date date not null,
 journal text not null default '',
 account text not null,
 account_label text,
 debit numeric(18,2) not null default 0,
 credit numeric(18,2) not null default 0,
 movement numeric(18,2) not null default 0,
 movement_kind text not null default 'PERIOD',
 last_import_id bigint references accounting_imports(id),
 raw_data jsonb,
 updated_at timestamptz not null default now(),
 unique(opale_entity,period_date,account,journal)
);
create index if not exists accounting_imports_entity_idx on accounting_imports(opale_entity,created_at desc);
create index if not exists accounting_lines_entity_period_idx on accounting_lines(opale_entity,period_date,account);
grant all on accounting_imports,accounting_lines to vigie;
grant usage,select on sequence accounting_imports_id_seq,accounting_lines_id_seq to vigie;
