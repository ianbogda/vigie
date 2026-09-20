alter table pcif_context add column if not exists uai text;
alter table pcif_context add column if not exists overdue_actions integer not null default 0;
alter table pcif_context add column if not exists trend text;
alter table pcif_context add column if not exists raw_payload jsonb;
create unique index if not exists pcif_context_uai_uidx on pcif_context(uai) where uai is not null;
