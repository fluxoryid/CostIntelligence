-- HPS Intelligence — Supabase baseline schema
-- Run in Supabase SQL Editor, then add each user to hps_tenant_members.
-- RLS is enabled on every public table. The browser uses only a publishable key.

create extension if not exists pgcrypto;

create table if not exists public.hps_tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hps_tenant_members (
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Requester' check (role in ('Requester','Procurement','Approver','Admin','Auditor')),
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id)
);

create table if not exists public.hps_requests (
  id text primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text,
  category text,
  product_name text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hps_audit_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  detail text,
  ts timestamptz not null default now()
);

create table if not exists public.hps_learning_outcomes (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  approved_for_learning boolean not null default false,
  source_mode text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.hps_tenants enable row level security;
alter table public.hps_tenant_members enable row level security;
alter table public.hps_requests enable row level security;
alter table public.hps_audit_log enable row level security;
alter table public.hps_learning_outcomes enable row level security;

-- Users can see tenant metadata only for tenants to which they belong.
drop policy if exists "tenant members can read tenants" on public.hps_tenants;
create policy "tenant members can read tenants" on public.hps_tenants for select to authenticated
using (exists (select 1 from public.hps_tenant_members m where m.tenant_id = id and m.user_id = (select auth.uid())));

-- Users can see only their own membership rows. Admin membership management should be performed server-side or in SQL Editor.
drop policy if exists "users read own memberships" on public.hps_tenant_members;
create policy "users read own memberships" on public.hps_tenant_members for select to authenticated
using (user_id = (select auth.uid()));

-- Requests: all tenant members can read; users can insert their own; Procurement/Admin/Approver can update tenant requests.
drop policy if exists "tenant members read requests" on public.hps_requests;
create policy "tenant members read requests" on public.hps_requests for select to authenticated
using (exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_requests.tenant_id and m.user_id = (select auth.uid())));

drop policy if exists "members insert own requests" on public.hps_requests;
create policy "members insert own requests" on public.hps_requests for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_requests.tenant_id and m.user_id = (select auth.uid())));

drop policy if exists "authorized roles update requests" on public.hps_requests;
create policy "authorized roles update requests" on public.hps_requests for update to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_requests.tenant_id and m.user_id = (select auth.uid()) and m.role in ('Procurement','Approver','Admin')))
with check (user_id = (select auth.uid()) or exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_requests.tenant_id and m.user_id = (select auth.uid()) and m.role in ('Procurement','Approver','Admin')));

-- Audit: tenant members can read; each user can append audit records as themselves. No update/delete policy is provided.
drop policy if exists "tenant members read audit" on public.hps_audit_log;
create policy "tenant members read audit" on public.hps_audit_log for select to authenticated
using (exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_audit_log.tenant_id and m.user_id = (select auth.uid())));

drop policy if exists "members append own audit" on public.hps_audit_log;
create policy "members append own audit" on public.hps_audit_log for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_audit_log.tenant_id and m.user_id = (select auth.uid())));

-- Learning outcomes: only approved outcomes are consumed by Model D; tenant members can read them.
drop policy if exists "tenant members read learning" on public.hps_learning_outcomes;
create policy "tenant members read learning" on public.hps_learning_outcomes for select to authenticated
using (exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_learning_outcomes.tenant_id and m.user_id = (select auth.uid())));

drop policy if exists "members insert own learning" on public.hps_learning_outcomes;
drop policy if exists "authorized roles insert learning" on public.hps_learning_outcomes;
create policy "authorized roles insert learning" on public.hps_learning_outcomes for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.hps_tenant_members m where m.tenant_id = hps_learning_outcomes.tenant_id and m.user_id = (select auth.uid()) and m.role in ('Procurement','Approver','Admin')));

-- Example bootstrap (replace values):
-- insert into public.hps_tenants(id,name) values ('default-org','My Organization') on conflict do nothing;
-- insert into public.hps_tenant_members(tenant_id,user_id,role) values ('default-org','<AUTH_USER_UUID>','Admin');
