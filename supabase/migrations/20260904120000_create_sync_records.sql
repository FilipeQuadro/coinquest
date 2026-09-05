create table if not exists public.sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_key text not null,
  entity_type text not null,
  payload jsonb null,
  deleted boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_key),
  constraint sync_records_payload_tombstone_check check (
    (deleted = false and payload is not null)
    or
    (deleted = true and payload is null)
  )
);

create index if not exists sync_records_user_updated_idx
  on public.sync_records (user_id, updated_at);

create or replace function public.coinquest_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_records_set_updated_at on public.sync_records;
create trigger sync_records_set_updated_at
before update on public.sync_records
for each row
execute function public.coinquest_set_updated_at();

alter table public.sync_records enable row level security;

revoke all on public.sync_records from PUBLIC;
revoke all on public.sync_records from anon;
revoke all on public.sync_records from authenticated;
grant select, insert, delete on public.sync_records to authenticated;

drop policy if exists "sync records select own" on public.sync_records;
create policy "sync records select own"
on public.sync_records
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "sync records insert own" on public.sync_records;
create policy "sync records insert own"
on public.sync_records
for insert
to authenticated
with check ((select auth.uid()) = user_id and revision = 1);

drop policy if exists "sync records update own" on public.sync_records;
create policy "sync records update own"
on public.sync_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "sync records delete own" on public.sync_records;
create policy "sync records delete own"
on public.sync_records
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.coinquest_update_sync_record(
  p_entity_key text,
  p_entity_type text,
  p_payload jsonb,
  p_deleted boolean,
  p_expected_revision integer,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_record public.sync_records%rowtype;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('status', 'not-authenticated');
  end if;

  if (p_deleted = false and p_payload is null) or (p_deleted = true and p_payload is not null) then
    raise exception 'Invalid tombstone payload state';
  end if;

  update public.sync_records
  set
    entity_type = p_entity_type,
    payload = p_payload,
    deleted = p_deleted,
    revision = public.sync_records.revision + 1,
    device_id = p_device_id
  where public.sync_records.user_id = (select auth.uid())
    and public.sync_records.entity_key = p_entity_key
    and public.sync_records.revision = p_expected_revision
  returning * into updated_record;

  if found then
    return jsonb_build_object('status', 'updated', 'record', to_jsonb(updated_record));
  end if;

  if exists (
    select 1
    from public.sync_records
    where public.sync_records.user_id = (select auth.uid())
      and public.sync_records.entity_key = p_entity_key
  ) then
    return jsonb_build_object('status', 'revision-conflict');
  end if;

  return jsonb_build_object('status', 'not-found');
end;
$$;

revoke all on function public.coinquest_update_sync_record(text, text, jsonb, boolean, integer, text) from PUBLIC;
revoke execute on function public.coinquest_update_sync_record(text, text, jsonb, boolean, integer, text) from anon;
grant execute on function public.coinquest_update_sync_record(text, text, jsonb, boolean, integer, text) to authenticated;
