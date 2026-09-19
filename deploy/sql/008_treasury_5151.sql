create table if not exists treasury_snapshots(
 id bigserial primary key, establishment_name text not null, opale_entity text, account text not null,
 snapshot_date date not null, source_filename text not null, source_format text not null,
 row_count integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists treasury_movements(
 id bigserial primary key, snapshot_id bigint not null references treasury_snapshots(id) on delete cascade,
 line_no integer not null, period text not null, period_date date not null, journal text,
 account text not null, account_label text, debit numeric(18,2) not null default 0,
 credit numeric(18,2) not null default 0, movement numeric(18,2) not null default 0,
 movement_kind text not null default 'PERIOD', entry_date date, entry_reference text, entry_label text, raw_data jsonb
);
create index if not exists treasury_snapshots_entity_idx on treasury_snapshots(opale_entity,snapshot_date desc);
create index if not exists treasury_movements_snapshot_period_idx on treasury_movements(snapshot_id,period_date);
grant all on treasury_snapshots,treasury_movements to vigie;
grant usage,select on sequence treasury_snapshots_id_seq to vigie;
grant usage,select on sequence treasury_movements_id_seq to vigie;
