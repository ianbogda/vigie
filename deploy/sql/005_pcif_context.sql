create table if not exists pcif_context(
 establishment_key text primary key,
 campaign_label text,
 mastery_level numeric(5,2),
 open_actions integer not null default 0,
 major_risks integer not null default 0,
 source_url text,
 updated_at timestamptz not null default now()
);
