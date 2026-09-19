create table if not exists accounting_agencies(
 id bigserial primary key,
 name text not null unique,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);

alter table establishments add column if not exists accounting_agency_id bigint references accounting_agencies(id);

insert into accounting_agencies(name)
select 'Agence comptable principale'
where not exists(select 1 from accounting_agencies);

update establishments
set accounting_agency_id=(select id from accounting_agencies order by id limit 1)
where accounting_agency_id is null;

create table if not exists users(
 id bigserial primary key,
 email text not null,
 first_name text,
 last_name text,
 password_hash text not null,
 global_role text not null default 'USER' check(global_role in ('ADMIN','USER')),
 is_active boolean not null default true,
 last_login_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists users_email_uidx on users(lower(email));

create table if not exists user_agency_roles(
 user_id bigint not null references users(id) on delete cascade,
 accounting_agency_id bigint not null references accounting_agencies(id) on delete cascade,
 role text not null check(role in ('ACCOUNTANT','DEPUTY','AGENCY_USER','VIEWER')),
 primary key(user_id,accounting_agency_id)
);

create table if not exists auth_sessions(
 id bigserial primary key,
 user_id bigint not null references users(id) on delete cascade,
 token_hash text not null unique,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 user_agent text,
 ip_address text
);
create index if not exists auth_sessions_expiry_idx on auth_sessions(expires_at);

create table if not exists audit_log(
 id bigserial primary key,
 user_id bigint references users(id) on delete set null,
 action text not null,
 establishment_id bigint references establishments(id) on delete set null,
 detail jsonb not null default '{}'::jsonb,
 ip_address text,
 created_at timestamptz not null default now()
);
create index if not exists audit_log_user_date_idx on audit_log(user_id,created_at desc);
create index if not exists audit_log_est_date_idx on audit_log(establishment_id,created_at desc);

grant all on accounting_agencies,users,user_agency_roles,auth_sessions,audit_log to vigie;
grant usage,select on all sequences in schema public to vigie;
