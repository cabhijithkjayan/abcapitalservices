-- AB Capital Services: operations database (PostgreSQL 15+).
-- Plain Postgres. Works on Supabase, Neon, AWS RDS or a local server.
-- Tables mirror the dashboard workbook sheets so Excel data can be imported directly.

-- gen_random_uuid() is built into PostgreSQL 13+, no extension needed.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table departments (
  id    smallserial primary key,
  name  text not null unique
);

insert into departments (name) values
  ('Management'), ('Sales & Marketing'), ('Company Formation'), ('PRO & Visa'), ('Banking'),
  ('Accounting & Tax'), ('Loans & Mortgage'), ('Advisory'), ('HR & Admin');

create table services (
  id             smallserial primary key,
  department_id  smallint not null references departments(id),
  name           text not null,
  default_fee    numeric(12,2),
  default_days   int,               -- target turnaround, drives case due dates
  unique (department_id, name)
);

-- Ordered workflow stages per service type (e.g. Documents -> Name Approval -> Licence Issued)
create table service_stages (
  id          serial primary key,
  service_id  smallint not null references services(id) on delete cascade,
  position    smallint not null,
  name        text not null,
  unique (service_id, position)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table staff (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique,       -- login identity (e.g. Supabase auth.users.id)
  full_name      text not null,
  email          text unique,
  department_id  smallint references departments(id),
  role           text not null default 'staff'
                 check (role in ('admin', 'manager', 'dept_head', 'staff', 'finance', 'viewer')),
  job_title      text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table staff_leave (
  id         bigserial primary key,
  staff_id   uuid not null references staff(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  kind       text not null default 'annual',
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Sales & Marketing
-- ---------------------------------------------------------------------------
-- Ad campaigns (Meta, Google, ...) and their monthly spend from the ad platforms
create table campaigns (
  id          serial primary key,
  name        text not null unique,
  platform    text not null check (platform in ('Meta', 'Google', 'LinkedIn', 'TikTok', 'Other')),
  objective   text,                               -- Lead form, Search, Traffic, ...
  service_id  smallint references services(id),
  starts_on   date,
  ends_on     date,
  active      boolean not null default true
);

create table campaign_spend (
  campaign_id  int not null references campaigns(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  spend_aed    numeric(12,2) not null default 0,
  impressions  bigint not null default 0,
  clicks       bigint not null default 0,
  primary key (campaign_id, month)
);

create table leads (
  id           bigserial primary key,
  ref          text unique,                       -- e.g. L0001
  created_on   date not null default current_date,
  source       text not null
               check (source in ('Website', 'WhatsApp', 'Referral', 'Book-a-Call', 'Cost Calculator', 'Walk-in', 'Meta Ads', 'Google Ads', 'Other')),
  campaign_id  int references campaigns(id),
  client_name  text not null,
  phone        text,
  email        text,
  service_id   smallint references services(id),
  value_aed    numeric(12,2) not null default 0,
  status       text not null default 'New'
               check (status in ('New', 'Contacted', 'Proposal', 'Won', 'Lost')),
  lost_reason  text,
  owner_id     uuid references staff(id),
  client_id    bigint,                            -- set when the lead converts
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table clients (
  id            bigserial primary key,
  ref           text unique,                      -- e.g. C001, the ClientID used across sheets
  name          text not null,                    -- main contact person
  company       text,
  jurisdiction  text,                             -- Dubai Mainland, SRTIP, IFZA, ...
  licence_no    text,
  trn           text,                             -- VAT/CT tax registration number
  email         text,
  phone         text,
  risk_rating   text check (risk_rating in ('Low', 'Medium', 'High')),  -- AML/CFT
  start_date    date,
  created_at    timestamptz not null default now()
);

alter table leads add constraint leads_client_fk foreign key (client_id) references clients(id);

-- Shareholders, signatories and other people linked to a client
create table client_contacts (
  id           bigserial primary key,
  client_id    bigint not null references clients(id) on delete cascade,
  full_name    text not null,
  role         text,                              -- Shareholder, Manager, Signatory
  nationality  text,
  email        text,
  phone        text
);

-- ---------------------------------------------------------------------------
-- Cases: every service job, across departments
-- ---------------------------------------------------------------------------
create table cases (
  id             bigserial primary key,
  ref            text unique,                     -- e.g. K0001
  client_id      bigint not null references clients(id),
  service_id     smallint not null references services(id),
  stage          text not null default 'New',
  assignee_id    uuid references staff(id),
  opened_on      date not null default current_date,
  due_on         date,
  closed_on      date,
  fee_aed        numeric(12,2) not null default 0,
  status         text not null default 'Open'
                 check (status in ('Open', 'On Hold', 'Completed', 'Cancelled')),
  notes          text,
  updated_at     timestamptz not null default now(),
  check (closed_on is null or closed_on >= opened_on)
);
create index cases_open_idx on cases (status, due_on) where status in ('Open', 'On Hold');
create index cases_assignee_idx on cases (assignee_id);

create table case_tasks (
  id           bigserial primary key,
  case_id      bigint not null references cases(id) on delete cascade,
  title        text not null,
  assignee_id  uuid references staff(id),
  due_on       date,
  done_at      timestamptz
);

create table case_comments (
  id          bigserial primary key,
  case_id     bigint not null references cases(id) on delete cascade,
  author_id   uuid references staff(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------------
-- Licences, visas, Emirates IDs and other documents that expire
create table expiries (
  id           bigserial primary key,
  client_id    bigint not null references clients(id) on delete cascade,
  contact_id   bigint references client_contacts(id) on delete set null,
  type         text not null,                     -- Trade Licence, Investor Visa, Emirates ID, ...
  number       text,
  expiry_date  date not null,
  renewed      boolean not null default false
);
create index expiries_date_idx on expiries (expiry_date) where not renewed;

create table bank_applications (
  id                bigserial primary key,
  client_id         bigint not null references clients(id),
  case_id           bigint references cases(id),
  bank              text not null,
  applied_on        date not null default current_date,
  status            text not null default 'Submitted'
                    check (status in ('Preparing', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Withdrawn')),
  rejection_reason  text,
  decided_on        date
);

create table tax_filings (
  id         bigserial primary key,
  client_id  bigint not null references clients(id),
  type       text not null
             check (type in ('VAT Return', 'Corporate Tax Return', 'E-invoicing', 'Tax Residency Certificate', 'Other')),
  period     text not null,                       -- Q3 2026, FY 2025
  due_on     date not null,
  filed_on   date,
  unique (client_id, type, period)
);
create index tax_filings_due_idx on tax_filings (due_on) where filed_on is null;

-- Files live in object storage (Supabase Storage, S3, OneDrive). Only metadata here.
create table documents (
  id            bigserial primary key,
  client_id     bigint references clients(id) on delete cascade,
  case_id       bigint references cases(id) on delete cascade,
  kind          text not null,                    -- Passport, Licence, MOA, Bank Letter, ...
  storage_path  text not null,
  expires_on    date,
  uploaded_by   uuid references staff(id),
  uploaded_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Finance (imported from Tally until invoicing moves here)
-- ---------------------------------------------------------------------------
create table finance_monthly (
  month            date primary key check (extract(day from month) = 1),
  revenue_aed      numeric(14,2) not null default 0,
  expenses_aed     numeric(14,2) not null default 0,
  collected_aed    numeric(14,2) not null default 0,
  vat_payable_aed  numeric(14,2) not null default 0
);

create table receivables (
  id            bigserial primary key,
  client_id     bigint references clients(id),
  client_name   text not null,                    -- as written in Tally
  invoice_no    text not null unique,
  invoice_date  date not null,
  due_on        date not null,
  amount_aed    numeric(14,2) not null,
  paid_on       date
);

create table bank_balances (
  id           bigserial primary key,
  bank         text not null,
  account      text not null,
  balance_aed  numeric(14,2) not null,
  as_of        date not null,
  unique (bank, account, as_of)
);

-- ---------------------------------------------------------------------------
-- Audit log: who changed what (required for KYC/AML records)
-- ---------------------------------------------------------------------------
create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text not null default current_user,
  table_name  text not null,
  row_id      text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb
);

create or replace function audit_row() returns trigger language plpgsql as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger leads_touch before update on leads for each row execute function touch_updated_at();
create trigger cases_touch before update on cases for each row execute function touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['clients', 'client_contacts', 'cases', 'expiries', 'bank_applications', 'tax_filings', 'documents', 'receivables', 'staff']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard views: the CEO dashboard reads these
-- ---------------------------------------------------------------------------
-- Spend, leads, wins and return per campaign
create view v_campaign_performance as
select c.id, c.name, c.platform,
       coalesce(s.spend, 0) as spend_aed, coalesce(s.impressions, 0) as impressions, coalesce(s.clicks, 0) as clicks,
       count(l.id) as leads,
       count(l.id) filter (where l.status = 'Won') as won,
       coalesce(sum(l.value_aed) filter (where l.status = 'Won'), 0) as won_value_aed,
       round(coalesce(s.spend, 0) / nullif(count(l.id), 0), 2) as cost_per_lead_aed,
       round(coalesce(sum(l.value_aed) filter (where l.status = 'Won'), 0) / nullif(s.spend, 0), 2) as return_on_spend
from campaigns c
left join (select campaign_id, sum(spend_aed) as spend, sum(impressions) as impressions, sum(clicks) as clicks
           from campaign_spend group by campaign_id) s on s.campaign_id = c.id
left join leads l on l.campaign_id = c.id
group by c.id, c.name, c.platform, s.spend, s.impressions, s.clicks;

create view v_cases as
select c.id, c.ref, c.client_id, cl.ref as client_ref, coalesce(cl.company, cl.name) as client,
       d.name as department, s.name as service, c.stage, st.full_name as assignee,
       c.opened_on, c.due_on, c.closed_on, c.fee_aed, c.status,
       (c.status in ('Open', 'On Hold') and c.due_on < current_date) as overdue
from cases c
join clients cl on cl.id = c.client_id
join services s on s.id = c.service_id
join departments d on d.id = s.department_id
left join staff st on st.id = c.assignee_id;

create view v_kpi_overview as
select
  (select count(*) from cases where status in ('Open', 'On Hold'))                                  as open_cases,
  (select count(*) from cases where status in ('Open', 'On Hold') and due_on < current_date)        as overdue_cases,
  (select count(*) from leads where created_on > current_date - 30)                                as leads_30d,
  (select count(*) from leads where created_on > current_date - 30 and status = 'Won')              as won_30d,
  (select count(*) from expiries where not renewed and expiry_date < current_date)                  as expired_docs,
  (select count(*) from expiries where not renewed and expiry_date between current_date and current_date + 30) as expiring_30d,
  (select count(*) from tax_filings where filed_on is null and due_on <= current_date + 14)         as tax_due_14d,
  (select count(*) from tax_filings where filed_on is null and due_on < current_date)               as tax_overdue,
  (select coalesce(sum(amount_aed), 0) from receivables where paid_on is null)                      as receivables_aed,
  (select coalesce(sum(balance_aed), 0) from bank_balances b
     where as_of = (select max(as_of) from bank_balances b2 where b2.bank = b.bank and b2.account = b.account)) as cash_aed;

create view v_attention as
select 'critical' as level, 'Tax overdue' as tag, t.type || ' ' || t.period || ' – ' || coalesce(cl.company, cl.name) as text, t.due_on - current_date as days
  from tax_filings t join clients cl on cl.id = t.client_id
  where t.filed_on is null and t.due_on < current_date
union all
select 'critical', 'Expired', e.type || ' – ' || coalesce(cl.company, cl.name), e.expiry_date - current_date
  from expiries e join clients cl on cl.id = e.client_id
  where not e.renewed and e.expiry_date < current_date
union all
select 'serious', 'Case overdue', v.service || ' – ' || v.client, v.due_on - current_date
  from v_cases v where v.overdue
union all
select 'warning', 'Expiring', e.type || ' – ' || coalesce(cl.company, cl.name), e.expiry_date - current_date
  from expiries e join clients cl on cl.id = e.client_id
  where not e.renewed and e.expiry_date between current_date and current_date + 14
union all
select 'warning', 'Tax due', t.type || ' ' || t.period || ' – ' || coalesce(cl.company, cl.name), t.due_on - current_date
  from tax_filings t join clients cl on cl.id = t.client_id
  where t.filed_on is null and t.due_on between current_date and current_date + 14;
