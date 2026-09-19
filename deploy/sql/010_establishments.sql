create table if not exists establishments(
 id bigserial primary key,
 uai text not null unique,
 name text not null,
 opale_entity text unique,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz
);
create index if not exists establishments_active_idx on establishments(is_active,name);
insert into establishments(uai,name,opale_entity)
select distinct upper(m[1]), coalesce(nullif(opale_entity_label,''),establishment_name,upper(m[1])), nullif(opale_entity,'')
from balance_snapshots b
cross join lateral regexp_match(upper(coalesce(b.opale_entity_label,'')||' '||coalesce(b.establishment_name,'')),'(0?[0-9]{7}[A-Z])') m
where m is not null
on conflict(uai) do nothing;
grant all on establishments to vigie;
grant usage,select on sequence establishments_id_seq to vigie;
