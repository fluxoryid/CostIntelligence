-- HPS Intelligence — production multi-tenant Supabase schema
-- Version: Phase 10 / 2026-09-16
-- Browser clients use ONLY the Supabase publishable key. Never expose service-role credentials.
-- Execute on a dedicated CostIntelligence Supabase project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tenant / membership model
-- ---------------------------------------------------------------------------
create table if not exists public.hps_tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hps_tenant_members (
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Procurement User',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id)
);

alter table public.hps_tenant_members drop constraint if exists hps_tenant_members_role_check;
alter table public.hps_tenant_members add constraint hps_tenant_members_role_check
  check (role in ('Procurement User','Analyst/Senior','Manager','Procurement Head/Admin','Auditor'));

-- SECURITY DEFINER helpers avoid recursive RLS evaluation.
create or replace function public.hps_is_member(p_tenant text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.hps_tenant_members m
    where m.tenant_id=p_tenant and m.user_id=auth.uid() and m.active=true
  );
$$;

create or replace function public.hps_role(p_tenant text)
returns text language sql stable security definer set search_path=public as $$
  select m.role from public.hps_tenant_members m
  where m.tenant_id=p_tenant and m.user_id=auth.uid() and m.active=true
  limit 1;
$$;

create or replace function public.hps_role_in(p_tenant text,p_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.hps_role(p_tenant)=any(p_roles),false);
$$;

-- ---------------------------------------------------------------------------
-- HPS request, immutable versions and maker-checker reviews
-- ---------------------------------------------------------------------------
create table if not exists public.hps_requests (
  id text primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
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
  constraint hps_request_status_check check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','REWORK','APPROVED','REJECTED','LOCKED','ARCHIVED'))
);

create index if not exists hps_requests_tenant_status_idx on public.hps_requests(tenant_id,status,updated_at desc);
create index if not exists hps_requests_tenant_category_idx on public.hps_requests(tenant_id,category,subcategory);

create table if not exists public.hps_request_versions (
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text not null references public.hps_requests(id) on delete cascade,
  version integer not null,
  workflow_status text not null,
  snapshot jsonb not null,
  content_hash text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (request_id,version)
);
create index if not exists hps_versions_tenant_request_idx on public.hps_request_versions(tenant_id,request_id,version desc);

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
  constraint hps_review_action_check check (action in ('SUBMIT','START_REVIEW','RETURN','APPROVE','REJECT','LOCK','COMMENT'))
);
create index if not exists hps_reviews_request_idx on public.hps_reviews(tenant_id,request_id,created_at desc);

-- ---------------------------------------------------------------------------
-- Evidence documents and component mappings
-- ---------------------------------------------------------------------------
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
  constraint hps_material_decision_check check(material_decision in ('PENDING','MATERIAL','CONTEXT','REJECT'))
);
create index if not exists hps_component_evidence_req_idx on public.hps_component_evidence(tenant_id,request_id,request_version);

-- ---------------------------------------------------------------------------
-- Audit, approved learning and negotiation outcomes
-- ---------------------------------------------------------------------------
create table if not exists public.hps_audit_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.hps_tenants(id) on delete cascade,
  request_id text references public.hps_requests(id) on delete set null,
  user_id uuid not null references auth.users(id),
  action text not null,
  detail jsonb,
  ts timestamptz not null default now()
);
create index if not exists hps_audit_tenant_ts_idx on public.hps_audit_log(tenant_id,ts desc);
create index if not exists hps_audit_request_idx on public.hps_audit_log(tenant_id,request_id,ts desc);

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

-- ---------------------------------------------------------------------------
-- Immutability / direct-update guardrails
-- ---------------------------------------------------------------------------
create or replace function public.hps_reject_version_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'HPS request versions are immutable';
end; $$;

drop trigger if exists hps_request_versions_immutable on public.hps_request_versions;
create trigger hps_request_versions_immutable before update or delete on public.hps_request_versions
for each row execute function public.hps_reject_version_mutation();

create or replace function public.hps_guard_request_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('hps.workflow_rpc',true)='on' then
    new.updated_at:=now(); new.lock_version:=old.lock_version+1; return new;
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
  new.updated_at:=now(); new.lock_version:=old.lock_version+1; return new;
end; $$;

drop trigger if exists hps_requests_guard_update on public.hps_requests;
create trigger hps_requests_guard_update before update on public.hps_requests
for each row execute function public.hps_guard_request_update();

-- ---------------------------------------------------------------------------
-- RPC: save immutable draft version
-- ---------------------------------------------------------------------------
create or replace function public.hps_save_draft(
  p_tenant_id text,
  p_request_id text,
  p_snapshot jsonb,
  p_category text default null,
  p_subcategory text default null,
  p_product_name text default null,
  p_content_hash text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_role text; v_req public.hps_requests%rowtype; v_version integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.hps_is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=public.hps_role(p_tenant_id);
  if v_role='Auditor' then raise exception 'Auditor is read-only'; end if;

  select * into v_req from public.hps_requests where id=p_request_id and tenant_id=p_tenant_id for update;
  if not found then
    insert into public.hps_requests(id,tenant_id,owner_user_id,status,category,subcategory,product_name,data)
    values(p_request_id,p_tenant_id,v_uid,'DRAFT',p_category,p_subcategory,p_product_name,p_snapshot)
    returning * into v_req;
  elsif v_req.status not in ('DRAFT','REWORK') then
    raise exception 'Cannot save content while request is %',v_req.status;
  elsif v_req.owner_user_id<>v_uid and v_role not in ('Analyst/Senior','Procurement Head/Admin') then
    raise exception 'Role % cannot edit another user request',v_role;
  end if;

  v_version:=coalesce(v_req.current_version,0)+1;
  insert into public.hps_request_versions(tenant_id,request_id,version,workflow_status,snapshot,content_hash,created_by)
  values(p_tenant_id,p_request_id,v_version,v_req.status,p_snapshot,p_content_hash,v_uid);

  perform set_config('hps.workflow_rpc','on',true);
  update public.hps_requests set current_version=v_version,category=p_category,subcategory=p_subcategory,product_name=p_product_name,data=p_snapshot
  where id=p_request_id and tenant_id=p_tenant_id;

  insert into public.hps_audit_log(tenant_id,request_id,user_id,action,detail)
  values(p_tenant_id,p_request_id,v_uid,'SAVE_DRAFT',jsonb_build_object('version',v_version,'role',v_role,'contentHash',p_content_hash));

  return jsonb_build_object('ok',true,'requestId',p_request_id,'status',v_req.status,'version',v_version);
end; $$;

-- ---------------------------------------------------------------------------
-- RPC: validated maker-checker workflow transition
-- ---------------------------------------------------------------------------
create or replace function public.hps_transition_request(
  p_tenant_id text,
  p_request_id text,
  p_action text,
  p_comment text default null,
  p_snapshot jsonb default null,
  p_content_hash text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_role text; v_req public.hps_requests%rowtype; v_new_status text; v_version integer; v_gate text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.hps_is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=public.hps_role(p_tenant_id);
  select * into v_req from public.hps_requests where id=p_request_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Request not found; save draft first'; end if;
  v_gate:=coalesce(p_snapshot#>>'{evidenceCoverage,gate}',p_snapshot#>>'{componentEvidence,coverage,gate}','BLOCKED');

  case upper(p_action)
    when 'SUBMIT' then
      if v_req.status not in ('DRAFT','REWORK') then raise exception 'SUBMIT invalid from %',v_req.status; end if;
      if v_role not in ('Procurement User','Procurement Head/Admin') then raise exception 'Role cannot submit'; end if;
      if v_gate='BLOCKED' then raise exception 'Evidence gate BLOCKED'; end if;
      v_new_status:='SUBMITTED';
    when 'START_REVIEW' then
      if v_req.status<>'SUBMITTED' then raise exception 'START_REVIEW invalid from %',v_req.status; end if;
      if v_role not in ('Analyst/Senior','Manager','Procurement Head/Admin') then raise exception 'Role cannot start review'; end if;
      v_new_status:='UNDER_REVIEW';
    when 'RETURN' then
      if v_req.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'RETURN invalid from %',v_req.status; end if;
      if v_role not in ('Analyst/Senior','Manager','Procurement Head/Admin') then raise exception 'Role cannot return'; end if;
      if coalesce(trim(p_comment),'')='' then raise exception 'Return reason required'; end if;
      v_new_status:='REWORK';
    when 'APPROVE' then
      if v_req.status<>'UNDER_REVIEW' then raise exception 'APPROVE invalid from %',v_req.status; end if;
      if v_role not in ('Manager','Procurement Head/Admin') then raise exception 'Role cannot approve'; end if;
      if v_gate<>'APPROVAL READY' then raise exception 'Evidence gate must be APPROVAL READY'; end if;
      v_new_status:='APPROVED';
    when 'REJECT' then
      if v_req.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'REJECT invalid from %',v_req.status; end if;
      if v_role not in ('Manager','Procurement Head/Admin') then raise exception 'Role cannot reject'; end if;
      if coalesce(trim(p_comment),'')='' then raise exception 'Rejection reason required'; end if;
      v_new_status:='REJECTED';
    when 'LOCK' then
      if v_req.status<>'APPROVED' then raise exception 'LOCK invalid from %',v_req.status; end if;
      if v_role<>'Procurement Head/Admin' then raise exception 'Only Procurement Head/Admin can lock'; end if;
      v_new_status:='LOCKED';
    else raise exception 'Unknown workflow action %',p_action;
  end case;

  v_version:=v_req.current_version;
  if p_snapshot is not null and upper(p_action) in ('SUBMIT','APPROVE') then
    v_version:=v_req.current_version+1;
    insert into public.hps_request_versions(tenant_id,request_id,version,workflow_status,snapshot,content_hash,created_by)
    values(p_tenant_id,p_request_id,v_version,v_new_status,p_snapshot,p_content_hash,v_uid);
  end if;

  perform set_config('hps.workflow_rpc','on',true);
  update public.hps_requests set status=v_new_status,current_version=v_version,
    approved_version=case when v_new_status='APPROVED' then v_version else approved_version end,
    data=case when p_snapshot is not null then p_snapshot else data end
  where id=p_request_id and tenant_id=p_tenant_id;

  insert into public.hps_reviews(tenant_id,request_id,request_version,stage,action,comment,user_id,role_at_action)
  values(p_tenant_id,p_request_id,v_version,v_new_status,upper(p_action),p_comment,v_uid,v_role);
  insert into public.hps_audit_log(tenant_id,request_id,user_id,action,detail)
  values(p_tenant_id,p_request_id,v_uid,'WORKFLOW_'||upper(p_action),jsonb_build_object('from',v_req.status,'to',v_new_status,'version',v_version,'role',v_role,'comment',p_comment));

  return jsonb_build_object('ok',true,'requestId',p_request_id,'status',v_new_status,'version',v_version,'approvedVersion',case when v_new_status='APPROVED' then v_version else v_req.approved_version end);
end; $$;

create or replace function public.hps_approve_learning_outcome(p_tenant_id text,p_outcome_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_role text;
begin
  if not public.hps_is_member(p_tenant_id) then raise exception 'No tenant access'; end if;
  v_role:=public.hps_role(p_tenant_id);
  if v_role not in ('Manager','Procurement Head/Admin') then raise exception 'Manager or Procurement Head/Admin required'; end if;
  update public.hps_learning_outcomes set approved_for_learning=p_approve,approved_by=case when p_approve then v_uid else null end,approved_at=case when p_approve then now() else null end
  where id=p_outcome_id and tenant_id=p_tenant_id;
  return jsonb_build_object('ok',true,'approved',p_approve);
end; $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hps_tenants enable row level security;
alter table public.hps_tenant_members enable row level security;
alter table public.hps_requests enable row level security;
alter table public.hps_request_versions enable row level security;
alter table public.hps_reviews enable row level security;
alter table public.hps_documents enable row level security;
alter table public.hps_component_evidence enable row level security;
alter table public.hps_audit_log enable row level security;
alter table public.hps_learning_outcomes enable row level security;
alter table public.hps_negotiation_outcomes enable row level security;

-- Tenant metadata
drop policy if exists hps_tenants_read on public.hps_tenants;
create policy hps_tenants_read on public.hps_tenants for select to authenticated using(public.hps_is_member(id));

-- Membership: own row; Head/Admin may read tenant roster.
drop policy if exists hps_members_read on public.hps_tenant_members;
create policy hps_members_read on public.hps_tenant_members for select to authenticated
using(user_id=auth.uid() or public.hps_role_in(tenant_id,array['Procurement Head/Admin']));

-- Requests: tenant read. Draft/rework direct edits only by owner or Analyst/Head. Workflow status changes are guarded by trigger/RPC.
drop policy if exists hps_requests_read on public.hps_requests;
create policy hps_requests_read on public.hps_requests for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_requests_insert on public.hps_requests;
create policy hps_requests_insert on public.hps_requests for insert to authenticated
with check(public.hps_is_member(tenant_id) and owner_user_id=auth.uid() and public.hps_role(tenant_id)<>'Auditor' and status='DRAFT');
drop policy if exists hps_requests_update on public.hps_requests;
create policy hps_requests_update on public.hps_requests for update to authenticated
using(public.hps_is_member(tenant_id) and (owner_user_id=auth.uid() or public.hps_role_in(tenant_id,array['Analyst/Senior','Procurement Head/Admin'])))
with check(public.hps_is_member(tenant_id));

-- Immutable versions: tenant read + member insert; no update/delete policy.
drop policy if exists hps_versions_read on public.hps_request_versions;
create policy hps_versions_read on public.hps_request_versions for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_versions_insert on public.hps_request_versions;
create policy hps_versions_insert on public.hps_request_versions for insert to authenticated
with check(public.hps_is_member(tenant_id) and created_by=auth.uid() and public.hps_role(tenant_id)<>'Auditor');

-- Reviews: tenant read; direct COMMENT only. Workflow actions are generated by RPC.
drop policy if exists hps_reviews_read on public.hps_reviews;
create policy hps_reviews_read on public.hps_reviews for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_reviews_comment on public.hps_reviews;
create policy hps_reviews_comment on public.hps_reviews for insert to authenticated
with check(public.hps_is_member(tenant_id) and user_id=auth.uid() and action='COMMENT' and public.hps_role(tenant_id)<>'Auditor');

-- Documents / evidence
drop policy if exists hps_documents_read on public.hps_documents;
create policy hps_documents_read on public.hps_documents for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_documents_insert on public.hps_documents;
create policy hps_documents_insert on public.hps_documents for insert to authenticated
with check(public.hps_is_member(tenant_id) and uploaded_by=auth.uid() and public.hps_role(tenant_id)<>'Auditor');
drop policy if exists hps_documents_update on public.hps_documents;
create policy hps_documents_update on public.hps_documents for update to authenticated
using(public.hps_role_in(tenant_id,array['Analyst/Senior','Procurement Head/Admin'])) with check(public.hps_is_member(tenant_id));

drop policy if exists hps_component_evidence_read on public.hps_component_evidence;
create policy hps_component_evidence_read on public.hps_component_evidence for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_component_evidence_write on public.hps_component_evidence;
create policy hps_component_evidence_write on public.hps_component_evidence for insert to authenticated
with check(public.hps_is_member(tenant_id) and public.hps_role_in(tenant_id,array['Procurement User','Analyst/Senior','Procurement Head/Admin']));
drop policy if exists hps_component_evidence_update on public.hps_component_evidence;
create policy hps_component_evidence_update on public.hps_component_evidence for update to authenticated
using(public.hps_role_in(tenant_id,array['Analyst/Senior','Procurement Head/Admin'])) with check(public.hps_is_member(tenant_id));

-- Audit append-only
drop policy if exists hps_audit_read on public.hps_audit_log;
create policy hps_audit_read on public.hps_audit_log for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_audit_insert on public.hps_audit_log;
create policy hps_audit_insert on public.hps_audit_log for insert to authenticated
with check(public.hps_is_member(tenant_id) and user_id=auth.uid());

-- Learning: tenant can read approved outcomes; Manager/Head can see pending. Members may submit pending outcomes.
drop policy if exists hps_learning_read on public.hps_learning_outcomes;
create policy hps_learning_read on public.hps_learning_outcomes for select to authenticated
using(public.hps_is_member(tenant_id) and (approved_for_learning=true or user_id=auth.uid() or public.hps_role_in(tenant_id,array['Manager','Procurement Head/Admin','Auditor'])));
drop policy if exists hps_learning_insert on public.hps_learning_outcomes;
create policy hps_learning_insert on public.hps_learning_outcomes for insert to authenticated
with check(public.hps_is_member(tenant_id) and user_id=auth.uid() and approved_for_learning=false and public.hps_role(tenant_id)<>'Auditor');
drop policy if exists hps_learning_update on public.hps_learning_outcomes;
create policy hps_learning_update on public.hps_learning_outcomes for update to authenticated
using(public.hps_role_in(tenant_id,array['Manager','Procurement Head/Admin'])) with check(public.hps_is_member(tenant_id));

-- Negotiation outcomes
drop policy if exists hps_negotiation_read on public.hps_negotiation_outcomes;
create policy hps_negotiation_read on public.hps_negotiation_outcomes for select to authenticated using(public.hps_is_member(tenant_id));
drop policy if exists hps_negotiation_insert on public.hps_negotiation_outcomes;
create policy hps_negotiation_insert on public.hps_negotiation_outcomes for insert to authenticated
with check(public.hps_is_member(tenant_id) and user_id=auth.uid() and public.hps_role(tenant_id)<>'Auditor');

-- ---------------------------------------------------------------------------
-- Private evidence Storage bucket + tenant path policies
-- File path format: <tenant_id>/<request_id>/<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hps-evidence','hps-evidence',false,20971520,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','text/plain','text/csv','application/json','image/png','image/jpeg'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists hps_storage_read on storage.objects;
create policy hps_storage_read on storage.objects for select to authenticated
using(bucket_id='hps-evidence' and public.hps_is_member((storage.foldername(name))[1]));

drop policy if exists hps_storage_insert on storage.objects;
create policy hps_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='hps-evidence' and public.hps_is_member((storage.foldername(name))[1]) and public.hps_role((storage.foldername(name))[1])<>'Auditor');

drop policy if exists hps_storage_update on storage.objects;
create policy hps_storage_update on storage.objects for update to authenticated
using(bucket_id='hps-evidence' and public.hps_role_in((storage.foldername(name))[1],array['Analyst/Senior','Procurement Head/Admin']));

drop policy if exists hps_storage_delete on storage.objects;
create policy hps_storage_delete on storage.objects for delete to authenticated
using(bucket_id='hps-evidence' and public.hps_role_in((storage.foldername(name))[1],array['Procurement Head/Admin']));

-- Grants for RPC use
grant execute on function public.hps_save_draft(text,text,jsonb,text,text,text,text) to authenticated;
grant execute on function public.hps_transition_request(text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.hps_approve_learning_outcome(text,uuid,boolean) to authenticated;

-- Bootstrap example (execute after creating the first Auth user):
-- insert into public.hps_tenants(id,name) values ('default-org','PT Mitra Transaksi Indonesia') on conflict do nothing;
-- insert into public.hps_tenant_members(tenant_id,user_id,role)
-- values ('default-org','<FIRST_AUTH_USER_UUID>','Procurement Head/Admin')
-- on conflict(tenant_id,user_id) do update set role=excluded.role,active=true;
