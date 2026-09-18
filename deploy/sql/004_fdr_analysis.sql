create table if not exists fdr_snapshots(
 id bigserial primary key, establishment_name text not null, snapshot_date date not null,
 source_filename text not null, row_count integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists fdr_lines(
 id bigserial primary key, snapshot_id bigint not null references fdr_snapshots(id) on delete cascade,
 exercise integer not null, amount numeric(16,2) not null, direction text, is_final boolean not null default false,
 establishment text, state text, source_modified_at date
);
create unique index if not exists idx_fdr_snapshot_exercise on fdr_lines(snapshot_id,exercise);
create index if not exists idx_fdr_establishment_exercise on fdr_lines(establishment,exercise desc);
