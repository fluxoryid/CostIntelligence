-- HPS Intelligence / CostIntelligence — production Supabase baseline
-- Live-aligned baseline: 2026-09-16
-- Target architecture: authenticated users + tenant RBAC + RPC-controlled workflow
-- + immutable HPS versions + private evidence Storage + append-only audit.
-- Browser clients use ONLY a Supabase publishable key. Never expose service-role credentials.

create extension if not exists pgcrypto;
create schema if not exists hps_private;
revoke all on schema hps_private from public, anon;
grant usage on schema hps_private to authenticated;

-- ===========================================================================
-- CORE TENANT / USER MODEL
-- ===========================================================================
create table if not exists public.hps_tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hps_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  access jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hps_tenant_members (
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Procurement User',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id),
  constraint hps_tenant_members_role_check
    check (role in ('Procurement User','Analyst/Senior','Manager','Procurement Head/Admin','Auditor'))
);
create index if not exists hps_members_user_fk_idx on public.hps_tenant_members(user_id);

-- Current production tenant used by config.js.
insert into public.hps_tenants(id,name)
values ('t1','Yokke')
on conflict(id) do nothing;

-- ===========================================================================
-- REQUESTS / VERSIONS / REVIEWS
-- ===========================================================================
create table if not exists public.hps_requests (
  id text primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  owner_user_id uuid references auth.users(id),
  legacy_created_by text,
  status text not null default 'DRAFT',
  category text,
  subcategory text,
  product_name text,
  current_version integer not null default 0,
  approved_version integer,
  lock_version bigint not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hps_request_status_check
    check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','REWORK','APPROVED','REJECTED','LOCKED','ARCHIVED'))
);
create index if not exists hps_requests_tenant_status_idx on public.hps_requests(tenant_id,status,updated_at desc);
create index if not exists hps_requests_tenant_category_idx on public.hps_requests(tenant_id,category,subcategory);
create index if not exists hps_requests_owner_fk_idx on public.hps_requests(owner_user_id);

create table if not exists public.hps_request_versions (
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text not null references public.hps_requests(id) on delete cascade,
  version integer not null,
  workflow_status text not null,
  snapshot jsonb not null,
  content_hash text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  primary key (request_id,version)
);
create index if not exists hps_versions_tenant_request_idx on public.hps_request_versions(tenant_id,request_id,version desc);
create index if not exists hps_versions_created_by_fk_idx on public.hps_request_versions(created_by);

create table if not exists public.hps_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text not null references public.hps_requests(id) on delete cascade,
  request_version integer,
  stage text not null,
  action text not null,
  comment text,
  user_id uuid not null references auth.users(id),
  role_at_action text not null,
  created_at timestamptz not null default now(),
  constraint hps_review_action_check
    check (action in ('SUBMIT','START_REVIEW','RETURN','APPROVE','REJECT','LOCK','COMMENT'))
);
create index if not exists hps_reviews_request_idx on public.hps_reviews(tenant_id,request_id,created_at desc);
create index if not exists hps_reviews_request_fk_idx on public.hps_reviews(request_id);
create index if not exists hps_reviews_user_fk_idx on public.hps_reviews(user_id);

-- ===========================================================================
-- DOCUMENT EVIDENCE HUB
-- ===========================================================================
create table if not exists public.hps_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text references public.hps_requests(id) on delete cascade,
  component_key text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  sha256 text not null,
  document_type text not null,
  reference text,
  issue_date date,
  valid_until date,
  extraction_status text not null default 'NOT_EXTRACTED',
  extracted_text text,
  extracted_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  uploaded_by uuid not null references auth.users(id),
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique(tenant_id,sha256),
  constraint hps_document_status_check check (status in ('ACTIVE','SUPERSEDED','REVOKED'))
);
create index if not exists hps_documents_request_idx on public.hps_documents(tenant_id,request_id,created_at desc);
create index if not exists hps_documents_reference_idx on public.hps_documents(tenant_id,reference,version desc);
create index if not exists hps_documents_request_fk_idx on public.hps_documents(request_id);
create index if not exists hps_documents_uploaded_by_fk_idx on public.hps_documents(uploaded_by);

create table if not exists public.hps_component_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text not null references public.hps_requests(id) on delete cascade,
  request_version integer not null,
  component_key text not null,
  slot_index integer not null default 0 check(slot_index between 0 and 9),
  document_id uuid references public.hps_documents(id),
  source_key text not null,
  source_reference text,
  published_date date,
  valid_until date,
  confidence_score integer check(confidence_score between 0 and 100),
  material_decision text not null default 'PENDING',
  reviewer_verified boolean not null default false,
  reviewer_user_id uuid references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,request_id,request_version,component_key,slot_index),
  constraint hps_material_decision_check
    check(material_decision in ('PENDING','MATERIAL','CONTEXT','REJECT'))
);
create index if not exists hps_component_evidence_req_idx on public.hps_component_evidence(tenant_id,request_id,request_version);
create index if not exists hps_component_document_fk_idx on public.hps_component_evidence(document_id);
create index if not exists hps_component_request_fk_idx on public.hps_component_evidence(request_id);
create index if not exists hps_component_reviewer_fk_idx on public.hps_component_evidence(reviewer_user_id);

-- ===========================================================================
-- AUDIT / LEARNING / NEGOTIATION
-- ===========================================================================
create table if not exists public.hps_audit_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text references public.hps_requests(id) on delete set null,
  user_id uuid references auth.users(id),
  actor_name text,
  actor_role text,
  action text not null,
  detail jsonb,
  ts timestamptz not null default now()
);
create index if not exists hps_audit_tenant_ts_idx on public.hps_audit_log(tenant_id,ts desc);
create index if not exists hps_audit_request_idx on public.hps_audit_log(tenant_id,request_id,ts desc);
create index if not exists hps_audit_request_fk_idx on public.hps_audit_log(request_id);
create index if not exists hps_audit_user_fk_idx on public.hps_audit_log(user_id);

create table if not exists public.hps_learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  request_id text references public.hps_requests(id) on delete set null,
  request_version integer,
  category text not null,
  subcategory text,
  approved_for_learning boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  source_mode text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists hps_learning_category_idx on public.hps_learning_outcomes(tenant_id,category,subcategory,approved_for_learning);
create index if not exists hps_learning_approved_by_fk_idx on public.hps_learning_outcomes(approved_by);
create index if not exists hps_learning_request_fk_idx on public.hps_learning_outcomes(request_id);
create index if not exists hps_learning_user_fk_idx on public.hps_learning_outcomes(user_id);

create table if not exists public.hps_negotiation_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text references public.hps_requests(id) on delete set null,
  request_version integer,
  user_id uuid not null references auth.users(id),
  supplier_name text,
  initial_offer numeric,
  final_offer numeric,
  hps_value numeric,
  target_value numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists hps_negotiation_req_idx on public.hps_negotiation_outcomes(tenant_id,request_id,created_at desc);
create index if not exists hps_negotiation_request_fk_idx on public.hps_negotiation_outcomes(request_id);
create index if not exists hps_negotiation_user_fk_idx on public.hps_negotiation_outcomes(user_id);

-- ===========================================================================
-- PRIVATE RBAC HELPERS + PUBLIC INVOKER WRAPPERS
-- ===========================================================================
create or replace function hps_private.is_member(p_tenant text)
returns boolean language sql stable security definer set search_path=public,hps_private as $$
  select exists(
    select 1 from public.hps_tenant_members m
    where m.tenant_id=p_tenant and m.user_id=auth.uid() and m.active=true
  );
$$;

create or replace function hps_private.role_for(p_tenant text)
returns text language sql stable security definer set search_path=public,hps_private as $$
  select m.role from public.hps_tenant_members m
  where m.tenant_id=p_tenant and m.user_id=auth.uid() and m.active=true
  limit 1;
$$;

create or replace function hps_private.role_in(p_tenant text,p_roles text[])
returns boolean language sql stable security definer set search_path=public,hps_private as $$
  select coalesce(hps_private.role_for(p_tenant)=any(p_roles),false);
$$;

revoke all on function hps_private.is_member(text) from public, anon;
revoke all on function hps_private.role_for(text) from public, anon;
revoke all on function hps_private.role_in(text,text[]) from public, anon;
grant execute on function hps_private.is_member(text) to authenticated;
grant execute on function hps_private.role_for(text) to authenticated;
grant execute on function hps_private.role_in(text,text[]) to authenticated;

create or replace function public.hps_is_member(p_tenant text)
returns boolean language sql stable security invoker set search_path=public,hps_private as $$
  select hps_private.is_member(p_tenant);
$$;
create or replace function public.hps_role(p_tenant text)
returns text language sql stable security invoker set search_path=public,hps_private as $$
  select hps_private.role_for(p_tenant);
$$;
create or replace function public.hps_role_in(p_tenant text,p_roles text[])
returns boolean language sql stable security invoker set search_path=public,hps_private as $$
  select hps_private.role_in(p_tenant,p_roles);
$$;
revoke all on function public.hps_is_member(text) from public, anon;
revoke all on function public.hps_role(text) from public, anon;
revoke all on function public.hps_role_in(text,text[]) from public, anon;
grant execute on function public.hps_is_member(text) to authenticated;
grant execute on function public.hps_role(text) to authenticated;
grant execute on function public.hps_role_in(text,text[]) to authenticated;

-- ===========================================================================
-- IMMUTABILITY / UPDATE GUARDS
-- ===========================================================================
create or replace function public.hps_reject_version_mutation()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'HPS request versions are immutable';
end; $$;

drop trigger if exists hps_request_versions_immutable on public.hps_request_versions;
create trigger hps_request_versions_immutable
before update or delete on public.hps_request_versions
for each row execute function public.hps_reject_version_mutation();

create or replace function public.hps_guard_request_update()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if current_setting('hps.workflow_rpc',true)='on' then
    new.updated_at:=now();
    new.lock_version:=old.lock_version+1;
    return new;
  end if;
  if old.status in ('APPROVED','LOCKED') then
    raise exception 'Approved/locked HPS is immutable; use controlled workflow/versioning';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Workflow status changes must use hps_transition_request()';
  end if;
  if old.status not in ('DRAFT','REWORK') then
    raise exception 'Request content can only be edited in DRAFT or REWORK';
  end if;
  new.updated_at:=now();
  new.lock_version:=old.lock_version+1;
  return new;
end; $$;

drop trigger if exists hps_requests_guard_update on public.hps_requests;
create trigger hps_requests_guard_update
before update on public.hps_requests
for each row execute function public.hps_guard_request_update();

-- ===========================================================================
-- CONTROLLED RPC: SAVE DRAFT / WORKFLOW / LEARNING APPROVAL
-- ===========================================================================
create or replace function public.hps_save_draft(
  p_tenant_id text,
  p_request_id text,
  p_snapshot jsonb,
  p_category text default null,
  p_subcategory text default null,
  p_product_name text default null,
  p_content_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,hps_private as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_req public.hps_requests%rowtype;
  v_version integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not hps_private.is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=hps_private.role_for(p_tenant_id);
  if v_role='Auditor' then raise exception 'Auditor is read-only'; end if;

  select * into v_req from public.hps_requests
  where id=p_request_id and tenant_id=p_tenant_id for update;

  if not found then
    insert into public.hps_requests(id,tenant_id,owner_user_id,status,category,subcategory,product_name,data)
    values(p_request_id,p_tenant_id,v_uid,'DRAFT',p_category,p_subcategory,p_product_name,p_snapshot)
    returning * into v_req;
  elsif v_req.status not in ('DRAFT','REWORK') then
    raise exception 'Cannot save content while request is %',v_req.status;
  elsif v_req.owner_user_id is distinct from v_uid and v_role not in ('Analyst/Senior','Procurement Head/Admin') then
    raise exception 'Role % cannot edit another user request',v_role;
  end if;

  v_version:=coalesce(v_req.current_version,0)+1;
  insert into public.hps_request_versions(
    tenant_id,request_id,version,workflow_status,snapshot,content_hash,created_by,created_by_name
  ) values(
    p_tenant_id,p_request_id,v_version,v_req.status,p_snapshot,p_content_hash,v_uid,
    coalesce((select display_name from public.hps_user_profiles where id=v_uid),
             (select email from public.hps_user_profiles where id=v_uid))
  );

  perform set_config('hps.workflow_rpc','on',true);
  update public.hps_requests
  set current_version=v_version,category=p_category,subcategory=p_subcategory,
      product_name=p_product_name,data=p_snapshot
  where id=p_request_id and tenant_id=p_tenant_id;

  insert into public.hps_audit_log(tenant_id,request_id,user_id,actor_name,actor_role,action,detail)
  values(
    p_tenant_id,p_request_id,v_uid,
    coalesce((select display_name from public.hps_user_profiles where id=v_uid),
             (select email from public.hps_user_profiles where id=v_uid)),
    v_role,'SAVE_DRAFT',jsonb_build_object('version',v_version,'role',v_role,'contentHash',p_content_hash)
  );

  return jsonb_build_object('ok',true,'requestId',p_request_id,'status',v_req.status,'version',v_version);
end; $$;

create or replace function public.hps_transition_request(
  p_tenant_id text,
  p_request_id text,
  p_action text,
  p_comment text default null,
  p_snapshot jsonb default null,
  p_content_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,hps_private as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_req public.hps_requests%rowtype;
  v_new_status text;
  v_version integer;
  v_gate text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not hps_private.is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=hps_private.role_for(p_tenant_id);

  select * into v_req from public.hps_requests
  where id=p_request_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Request not found; save draft first'; end if;

  v_gate:=coalesce(
    p_snapshot#>>'{evidenceCoverage,gate}',
    p_snapshot#>>'{componentEvidence,coverage,gate}',
    v_req.data#>>'{evidenceCoverage,gate}',
    v_req.data#>>'{componentEvidence,coverage,gate}',
    'BLOCKED'
  );

  case upper(p_action)
    when 'SUBMIT' then
      if v_req.status not in ('DRAFT','REWORK') then raise exception 'SUBMIT invalid from %',v_req.status; end if;
      if v_role not in ('Procurement User','Analyst/Senior','Procurement Head/Admin') then raise exception 'Role cannot submit'; end if;
      if v_req.owner_user_id is not null and v_req.owner_user_id<>v_uid and v_role<>'Procurement Head/Admin' then raise exception 'Only maker/owner can submit'; end if;
      if v_gate='BLOCKED' then raise exception 'Evidence gate BLOCKED'; end if;
      v_new_status:='SUBMITTED';

    when 'START_REVIEW' then
      if v_req.status<>'SUBMITTED' then raise exception 'START_REVIEW invalid from %',v_req.status; end if;
      if v_role not in ('Analyst/Senior','Manager','Procurement Head/Admin') then raise exception 'Role cannot start review'; end if;
      if v_req.owner_user_id=v_uid then raise exception 'Maker-checker violation: maker cannot review own request'; end if;
      v_new_status:='UNDER_REVIEW';

    when 'RETURN' then
      if v_req.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'RETURN invalid from %',v_req.status; end if;
      if v_role not in ('Analyst/Senior','Manager','Procurement Head/Admin') then raise exception 'Role cannot return'; end if;
      if coalesce(trim(p_comment),'')='' then raise exception 'Return reason required'; end if;
      v_new_status:='REWORK';

    when 'APPROVE' then
      if v_req.status<>'UNDER_REVIEW' then raise exception 'APPROVE invalid from %',v_req.status; end if;
      if v_role not in ('Manager','Procurement Head/Admin') then raise exception 'Role cannot approve'; end if;
      if v_req.owner_user_id=v_uid then raise exception 'Maker-checker violation: maker cannot approve own request'; end if;
      if v_gate<>'APPROVAL READY' then raise exception 'Evidence gate must be APPROVAL READY'; end if;
      v_new_status:='APPROVED';

    when 'REJECT' then
      if v_req.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'REJECT invalid from %',v_req.status; end if;
      if v_role not in ('Manager','Procurement Head/Admin') then raise exception 'Role cannot reject'; end if;
      if v_req.owner_user_id=v_uid then raise exception 'Maker-checker violation: maker cannot reject own request'; end if;
      if coalesce(trim(p_comment),'')='' then raise exception 'Rejection reason required'; end if;
      v_new_status:='REJECTED';

    when 'LOCK' then
      if v_req.status<>'APPROVED' then raise exception 'LOCK invalid from %',v_req.status; end if;
      if v_role<>'Procurement Head/Admin' then raise exception 'Only Procurement Head/Admin can lock'; end if;
      if v_req.owner_user_id=v_uid then raise exception 'Maker-checker violation: maker cannot lock own request'; end if;
      v_new_status:='LOCKED';

    else
      raise exception 'Unknown workflow action %',p_action;
  end case;

  v_version:=v_req.current_version;
  if p_snapshot is not null and upper(p_action) in ('SUBMIT','APPROVE') then
    v_version:=v_req.current_version+1;
    insert into public.hps_request_versions(
      tenant_id,request_id,version,workflow_status,snapshot,content_hash,created_by,created_by_name
    ) values(
      p_tenant_id,p_request_id,v_version,v_new_status,p_snapshot,p_content_hash,v_uid,
      coalesce((select display_name from public.hps_user_profiles where id=v_uid),
               (select email from public.hps_user_profiles where id=v_uid))
    );
  end if;

  perform set_config('hps.workflow_rpc','on',true);
  update public.hps_requests
  set status=v_new_status,
      current_version=v_version,
      approved_version=case when v_new_status='APPROVED' then v_version else approved_version end,
      data=case when p_snapshot is not null then p_snapshot else data end
  where id=p_request_id and tenant_id=p_tenant_id;

  insert into public.hps_reviews(tenant_id,request_id,request_version,stage,action,comment,user_id,role_at_action)
  values(p_tenant_id,p_request_id,v_version,v_new_status,upper(p_action),p_comment,v_uid,v_role);

  insert into public.hps_audit_log(tenant_id,request_id,user_id,actor_name,actor_role,action,detail)
  values(
    p_tenant_id,p_request_id,v_uid,
    coalesce((select display_name from public.hps_user_profiles where id=v_uid),
             (select email from public.hps_user_profiles where id=v_uid)),
    v_role,'WORKFLOW_'||upper(p_action),
    jsonb_build_object('from',v_req.status,'to',v_new_status,'version',v_version,'role',v_role,'comment',p_comment)
  );

  return jsonb_build_object(
    'ok',true,'requestId',p_request_id,'status',v_new_status,'version',v_version,
    'approvedVersion',case when v_new_status='APPROVED' then v_version else v_req.approved_version end
  );
end; $$;

create or replace function public.hps_approve_learning_outcome(
  p_tenant_id text,
  p_outcome_id uuid,
  p_approve boolean
) returns jsonb language plpgsql security definer set search_path=public,hps_private as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not hps_private.is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=hps_private.role_for(p_tenant_id);
  if v_role not in ('Manager','Procurement Head/Admin') then
    raise exception 'Manager or Procurement Head/Admin required';
  end if;

  update public.hps_learning_outcomes
  set approved_for_learning=p_approve,
      approved_by=case when p_approve then v_uid else null end,
      approved_at=case when p_approve then now() else null end
  where id=p_outcome_id and tenant_id=p_tenant_id;

  return jsonb_build_object('ok',true,'approved',p_approve);
end; $$;

revoke all on function public.hps_save_draft(text,text,jsonb,text,text,text,text) from public, anon;
revoke all on function public.hps_transition_request(text,text,text,text,jsonb,text) from public, anon;
revoke all on function public.hps_approve_learning_outcome(text,uuid,boolean) from public, anon;
grant execute on function public.hps_save_draft(text,text,jsonb,text,text,text,text) to authenticated;
grant execute on function public.hps_transition_request(text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.hps_approve_learning_outcome(text,uuid,boolean) to authenticated;
revoke all on function public.hps_guard_request_update() from public, anon, authenticated;
revoke all on function public.hps_reject_version_mutation() from public, anon, authenticated;

-- ===========================================================================
-- ROW LEVEL SECURITY
-- Core request + immutable-version WRITE is RPC-only by design.
-- ===========================================================================
alter table public.hps_tenants enable row level security;
alter table public.hps_user_profiles enable row level security;
alter table public.hps_tenant_members enable row level security;
alter table public.hps_requests enable row level security;
alter table public.hps_request_versions enable row level security;
alter table public.hps_reviews enable row level security;
alter table public.hps_documents enable row level security;
alter table public.hps_component_evidence enable row level security;
alter table public.hps_audit_log enable row level security;
alter table public.hps_learning_outcomes enable row level security;
alter table public.hps_negotiation_outcomes enable row level security;

-- Tenant and identity reads.
drop policy if exists hps_tenants_read on public.hps_tenants;
create policy hps_tenants_read on public.hps_tenants
for select to authenticated using(public.hps_is_member(id));

drop policy if exists hps_profiles_read on public.hps_user_profiles;
create policy hps_profiles_read on public.hps_user_profiles
for select to authenticated using(
  id=(select auth.uid()) or exists(
    select 1
    from public.hps_tenant_members me
    join public.hps_tenant_members target on target.tenant_id=me.tenant_id
    where me.user_id=(select auth.uid())
      and me.active=true
      and me.role='Procurement Head/Admin'
      and target.user_id=hps_user_profiles.id
  )
);

drop policy if exists hps_members_read on public.hps_tenant_members;
create policy hps_members_read on public.hps_tenant_members
for select to authenticated
using(user_id=(select auth.uid()) or public.hps_role_in(tenant_id,array['Procurement Head/Admin']));

-- Requests and immutable versions: tenant read only. All writes use RPCs.
drop policy if exists hps_requests_read on public.hps_requests;
create policy hps_requests_read on public.hps_requests
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_requests_insert on public.hps_requests;
drop policy if exists hps_requests_update on public.hps_requests;

drop policy if exists hps_versions_read on public.hps_request_versions;
create policy hps_versions_read on public.hps_request_versions
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_versions_insert on public.hps_request_versions;

-- Reviews: read by tenant. Direct write is COMMENT only; workflow actions come from RPC.
drop policy if exists hps_reviews_read on public.hps_reviews;
create policy hps_reviews_read on public.hps_reviews
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_reviews_comment on public.hps_reviews;
create policy hps_reviews_comment on public.hps_reviews
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and user_id=(select auth.uid())
  and action='COMMENT'
  and public.hps_role(tenant_id)<>'Auditor'
);

-- Documents / mapped component evidence.
drop policy if exists hps_documents_read on public.hps_documents;
create policy hps_documents_read on public.hps_documents
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_documents_insert on public.hps_documents;
create policy hps_documents_insert on public.hps_documents
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and uploaded_by=(select auth.uid())
  and public.hps_role(tenant_id)<>'Auditor'
);
drop policy if exists hps_documents_update on public.hps_documents;
create policy hps_documents_update on public.hps_documents
for update to authenticated
using(public.hps_role_in(tenant_id,array['Analyst/Senior','Procurement Head/Admin']))
with check(public.hps_is_member(tenant_id));

drop policy if exists hps_component_evidence_read on public.hps_component_evidence;
create policy hps_component_evidence_read on public.hps_component_evidence
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_component_evidence_write on public.hps_component_evidence;
create policy hps_component_evidence_write on public.hps_component_evidence
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and public.hps_role_in(tenant_id,array['Procurement User','Analyst/Senior','Procurement Head/Admin'])
);
drop policy if exists hps_component_evidence_update on public.hps_component_evidence;
create policy hps_component_evidence_update on public.hps_component_evidence
for update to authenticated
using(public.hps_role_in(tenant_id,array['Analyst/Senior','Procurement Head/Admin']))
with check(public.hps_is_member(tenant_id));

-- Audit: server-managed append-only. Authenticated clients may read tenant audit events, but cannot insert/update/delete them directly.
drop policy if exists hps_audit_read on public.hps_audit_log;
create policy hps_audit_read on public.hps_audit_log
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_audit_insert on public.hps_audit_log;\n
-- Learning: submit pending; Manager/Head approval is RPC-only.
drop policy if exists hps_learning_read on public.hps_learning_outcomes;
create policy hps_learning_read on public.hps_learning_outcomes
for select to authenticated using(
  public.hps_is_member(tenant_id)
  and (
    approved_for_learning=true
    or user_id=(select auth.uid())
    or public.hps_role_in(tenant_id,array['Manager','Procurement Head/Admin','Auditor'])
  )
);
drop policy if exists hps_learning_insert on public.hps_learning_outcomes;
create policy hps_learning_insert on public.hps_learning_outcomes
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and user_id=(select auth.uid())
  and approved_for_learning=false
  and public.hps_role(tenant_id)<>'Auditor'
);
drop policy if exists hps_learning_update on public.hps_learning_outcomes;

-- Negotiation outcomes.
drop policy if exists hps_negotiation_read on public.hps_negotiation_outcomes;
create policy hps_negotiation_read on public.hps_negotiation_outcomes
for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_negotiation_insert on public.hps_negotiation_outcomes;
create policy hps_negotiation_insert on public.hps_negotiation_outcomes
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and user_id=(select auth.uid())
  and public.hps_role(tenant_id)<>'Auditor'
);

-- ===========================================================================
-- PRIVATE EVIDENCE STORAGE
-- File path: <tenant_id>/<request_id>/<unique_filename>
-- ===========================================================================
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'hps-evidence','hps-evidence',false,20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
    'text/plain','text/csv','application/json','image/png','image/jpeg'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists hps_storage_read on storage.objects;
create policy hps_storage_read on storage.objects
for select to authenticated
using(bucket_id='hps-evidence' and public.hps_is_member((storage.foldername(name))[1]));

drop policy if exists hps_storage_insert on storage.objects;
create policy hps_storage_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='hps-evidence'
  and public.hps_is_member((storage.foldername(name))[1])
  and public.hps_role((storage.foldername(name))[1])<>'Auditor'
);

drop policy if exists hps_storage_update on storage.objects;
create policy hps_storage_update on storage.objects
for update to authenticated
using(
  bucket_id='hps-evidence'
  and public.hps_role_in((storage.foldername(name))[1],array['Analyst/Senior','Procurement Head/Admin'])
);

drop policy if exists hps_storage_delete on storage.objects;
create policy hps_storage_delete on storage.objects
for delete to authenticated
using(
  bucket_id='hps-evidence'
  and public.hps_role_in((storage.foldername(name))[1],array['Procurement Head/Admin'])
);

-- ===========================================================================
-- LEAST-PRIVILEGE TABLE GRANTS
-- RLS remains the row boundary; grants reduce the SQL operation surface.
-- ===========================================================================
revoke all on table public.hps_tenants from anon,authenticated;
revoke all on table public.hps_user_profiles from anon,authenticated;
revoke all on table public.hps_tenant_members from anon,authenticated;
revoke all on table public.hps_requests from anon,authenticated;
revoke all on table public.hps_request_versions from anon,authenticated;
revoke all on table public.hps_reviews from anon,authenticated;
revoke all on table public.hps_documents from anon,authenticated;
revoke all on table public.hps_component_evidence from anon,authenticated;
revoke all on table public.hps_audit_log from anon,authenticated;
revoke all on table public.hps_learning_outcomes from anon,authenticated;
revoke all on table public.hps_negotiation_outcomes from anon,authenticated;

grant select on table public.hps_tenants to authenticated;
grant select on table public.hps_user_profiles to authenticated;
grant select on table public.hps_tenant_members to authenticated;
grant select on table public.hps_requests to authenticated;
grant select on table public.hps_request_versions to authenticated;
grant select,insert on table public.hps_reviews to authenticated;
grant select,insert,update on table public.hps_documents to authenticated;
grant select,insert,update on table public.hps_component_evidence to authenticated;
grant select on table public.hps_audit_log to authenticated;
grant select,insert on table public.hps_learning_outcomes to authenticated;
grant select,insert on table public.hps_negotiation_outcomes to authenticated;

-- Audit identity sequence is not available to browser roles. SECURITY DEFINER
-- workflow functions insert authoritative audit events using owner privileges.
do $
begin
  if to_regclass('public.hps_audit_log_id_seq') is not null then
    execute 'revoke all on sequence public.hps_audit_log_id_seq from anon, authenticated';
  end if;
end $;

-- ===========================================================================
-- BOOTSTRAP NOTES
-- ===========================================================================
-- 1. Create/invite users in Supabase Auth.
-- 2. Create/update hps_user_profiles rows using those auth.users UUIDs.
-- 3. Insert hps_tenant_members rows for tenant `t1` with one of:
--    Procurement User | Analyst/Senior | Manager | Procurement Head/Admin | Auditor
-- 4. Browser configuration must contain only project URL + publishable key.
-- 5. Do not grant anon policies or expose a service-role key in frontend code.


-- ===========================================================================
-- PRODUCTION UAT CONSOLE
-- Build-scoped UAT run + append-only attempts. Final sign-off is a controlled
-- UPDATE guarded by RLS plus a non-callable SECURITY DEFINER trigger.
-- ===========================================================================
create table if not exists public.hps_uat_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  build_id text not null check(length(build_id) between 1 and 120),
  status text not null default 'IN_PROGRESS' check(status in ('IN_PROGRESS','SIGNED_OFF')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signed_off_by uuid references auth.users(id),
  signed_off_at timestamptz,
  signoff_note text check(signoff_note is null or length(signoff_note)<=5000),
  unique(tenant_id,build_id),
  unique(id,tenant_id)
);
create index if not exists hps_uat_runs_tenant_status_idx on public.hps_uat_runs(tenant_id,status,created_at desc);
create index if not exists hps_uat_runs_created_by_idx on public.hps_uat_runs(created_by);
create index if not exists hps_uat_runs_signed_off_by_idx on public.hps_uat_runs(signed_off_by);

create table if not exists public.hps_uat_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  run_id uuid not null,
  test_id text not null check(test_id ~ '^UAT-(0[1-9]|1[0-9]|2[0-4])$'),
  result text not null check(result in ('PASS','FAIL','BLOCKED')),
  tester_user_id uuid not null references auth.users(id),
  tester_role text not null check(tester_role in ('Procurement User','Analyst/Senior','Manager','Procurement Head/Admin','Auditor')),
  evidence text not null check(length(trim(evidence)) between 1 and 5000),
  defect_ref text check(defect_ref is null or length(defect_ref)<=500),
  retest_notes text check(retest_notes is null or length(retest_notes)<=5000),
  browser_device text check(browser_device is null or length(browser_device)<=500),
  created_at timestamptz not null default now(),
  constraint hps_uat_attempt_fail_defect check(result<>'FAIL' or nullif(trim(coalesce(defect_ref,'')),'') is not null),
  constraint hps_uat_attempt_run_tenant_fk foreign key(run_id,tenant_id)
    references public.hps_uat_runs(id,tenant_id) on delete restrict
);
create index if not exists hps_uat_attempt_latest_idx on public.hps_uat_attempts(tenant_id,run_id,test_id,created_at desc,id desc);
create index if not exists hps_uat_attempt_tester_idx on public.hps_uat_attempts(tester_user_id,created_at desc);

create or replace function public.hps_reject_uat_attempt_mutation()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'UAT attempts are append-only; record a new retest attempt instead';
end; $$;

drop trigger if exists hps_uat_attempts_immutable on public.hps_uat_attempts;
create trigger hps_uat_attempts_immutable
before update or delete on public.hps_uat_attempts
for each row execute function public.hps_reject_uat_attempt_mutation();

create or replace function public.hps_guard_uat_run_signoff()
returns trigger language plpgsql security definer set search_path=public,hps_private as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_total integer;
  v_pass integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not hps_private.is_member(old.tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=hps_private.role_for(old.tenant_id);
  if v_role<>'Procurement Head/Admin' then raise exception 'Procurement Head/Admin required for UAT sign-off'; end if;
  if old.status='SIGNED_OFF' then raise exception 'Signed-off UAT run is immutable'; end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.build_id is distinct from old.build_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only UAT sign-off fields may change';
  end if;
  if new.status<>'SIGNED_OFF' then raise exception 'UAT run update must be final SIGNED_OFF transition'; end if;

  select count(*),count(*) filter(where result='PASS')
  into v_total,v_pass
  from (
    select distinct on (a.test_id) a.test_id,a.result
    from public.hps_uat_attempts a
    where a.run_id=old.id and a.tenant_id=old.tenant_id
    order by a.test_id,a.created_at desc,a.id desc
  ) latest;

  if v_total<>24 or v_pass<>24 then
    raise exception 'All 24 latest UAT results must be PASS before sign-off';
  end if;

  new.signed_off_by:=v_uid;
  new.signed_off_at:=now();
  new.updated_at:=now();

  insert into public.hps_audit_log(tenant_id,request_id,user_id,actor_name,actor_role,action,detail)
  values(
    old.tenant_id,null,v_uid,
    coalesce((select display_name from public.hps_user_profiles where id=v_uid),
             (select email from public.hps_user_profiles where id=v_uid)),
    v_role,'UAT_SIGNOFF',
    jsonb_build_object('uatRunId',old.id,'buildId',old.build_id,'passCount',v_pass,'note',new.signoff_note)
  );
  return new;
end; $$;

drop trigger if exists hps_uat_run_signoff_guard on public.hps_uat_runs;
create trigger hps_uat_run_signoff_guard
before update on public.hps_uat_runs
for each row execute function public.hps_guard_uat_run_signoff();

revoke all on function public.hps_reject_uat_attempt_mutation() from public,anon,authenticated;
revoke all on function public.hps_guard_uat_run_signoff() from public,anon,authenticated;

alter table public.hps_uat_runs enable row level security;
alter table public.hps_uat_attempts enable row level security;

drop policy if exists hps_uat_runs_read on public.hps_uat_runs;
create policy hps_uat_runs_read on public.hps_uat_runs
for select to authenticated
using(public.hps_is_member(tenant_id));

drop policy if exists hps_uat_runs_insert on public.hps_uat_runs;
create policy hps_uat_runs_insert on public.hps_uat_runs
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and public.hps_role(tenant_id)<>'Auditor'
  and created_by=(select auth.uid())
  and status='IN_PROGRESS'
  and signed_off_by is null
  and signed_off_at is null
);

drop policy if exists hps_uat_runs_signoff on public.hps_uat_runs;
create policy hps_uat_runs_signoff on public.hps_uat_runs
for update to authenticated
using(
  public.hps_is_member(tenant_id)
  and public.hps_role(tenant_id)='Procurement Head/Admin'
  and status='IN_PROGRESS'
)
with check(
  public.hps_is_member(tenant_id)
  and public.hps_role(tenant_id)='Procurement Head/Admin'
  and status='SIGNED_OFF'
  and signed_off_by=(select auth.uid())
  and signed_off_at is not null
);

drop policy if exists hps_uat_attempts_read on public.hps_uat_attempts;
create policy hps_uat_attempts_read on public.hps_uat_attempts
for select to authenticated
using(public.hps_is_member(tenant_id));

drop policy if exists hps_uat_attempts_insert on public.hps_uat_attempts;
create policy hps_uat_attempts_insert on public.hps_uat_attempts
for insert to authenticated
with check(
  public.hps_is_member(tenant_id)
  and public.hps_role(tenant_id)<>'Auditor'
  and tester_user_id=(select auth.uid())
  and tester_role=public.hps_role(tenant_id)
  and exists(
    select 1 from public.hps_uat_runs r
    where r.id=run_id
      and r.tenant_id=tenant_id
      and r.status='IN_PROGRESS'
  )
);

revoke all on table public.hps_uat_runs from anon,authenticated;
revoke all on table public.hps_uat_attempts from anon,authenticated;
grant select on table public.hps_uat_runs to authenticated;
grant insert(tenant_id,build_id,created_by) on table public.hps_uat_runs to authenticated;
grant update(status,signoff_note) on table public.hps_uat_runs to authenticated;
grant select on table public.hps_uat_attempts to authenticated;
grant insert(tenant_id,run_id,test_id,result,tester_user_id,tester_role,evidence,defect_ref,retest_notes,browser_device)
  on table public.hps_uat_attempts to authenticated;
