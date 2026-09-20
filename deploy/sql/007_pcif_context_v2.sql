alter table pcif_context add column if not exists campaign_status text;
alter table pcif_context add column if not exists mastery_scale text;
alter table pcif_context add column if not exists completion integer not null default 0;
alter table pcif_context add column if not exists answered integer not null default 0;
alter table pcif_context add column if not exists total integer not null default 0;
alter table pcif_context add column if not exists attention jsonb not null default '[]'::jsonb;
create index if not exists pcif_context_updated_idx on pcif_context(updated_at desc);
