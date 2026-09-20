create table if not exists budget_snapshots(
 id bigserial primary key, establishment_name text not null, opale_entity text, snapshot_date date not null,
 source_filename text not null, row_count integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists budget_lines(
 id bigserial primary key, snapshot_id bigint not null references budget_snapshots(id) on delete cascade,
 line_no integer, raw_dimensions jsonb not null default '[]'::jsonb, budget numeric(16,2) not null default 0,
 committed numeric(16,2) not null default 0, accounted numeric(16,2) not null default 0,
 in_progress numeric(16,2) not null default 0, available numeric(16,2) not null default 0
);
create index if not exists idx_budget_lines_snapshot on budget_lines(snapshot_id);

create table if not exists purchase_snapshots(
 id bigserial primary key, establishment_name text not null, snapshot_date date not null,
 source_filename text not null, row_count integer not null default 0, rejected_row_count integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists purchase_lines(
 id bigserial primary key, snapshot_id bigint not null references purchase_snapshots(id) on delete cascade,
 line_no integer, establishment text, order_number text, internal_order_number text, sub_number text,
 market text, supplier text, order_date date, currency text, order_line text, stage text, article text,
 article_label text, quantity numeric(18,4), received_quantity numeric(18,4), receipt_date date,
 invoiced_quantity numeric(18,4), warehouse text, expected_delivery_date date, purchase_mode text,
 receipt_balance_quantity numeric(18,4), invoice_balance_quantity numeric(18,4), ordered_price numeric(18,4),
 received_price numeric(18,4), invoice_price numeric(18,4), invoice_amount numeric(18,4), account text,
 cgr_a text, cgr_b text, creator text, created_at_source timestamptz, modifier text, modified_at_source timestamptz,
 raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_purchase_lines_snapshot_order on purchase_lines(snapshot_id,order_number);
create index if not exists idx_purchase_lines_supplier on purchase_lines(snapshot_id,supplier);
