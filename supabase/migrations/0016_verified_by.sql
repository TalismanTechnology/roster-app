-- Roster · 0016 · Who verified an entry
--
-- A verified badge is only as good as the name behind it, so the record shows
-- "Verified by Tom Bradley, Head Coach". The coach who vouches is often not a
-- Roster account (see coach_contacts, 0004), so `verifier_id` alone cannot
-- carry the name: these two columns hold it as given at verification time.
--
-- Additive and safe to re-run against live.

alter table verifications
  add column if not exists verifier_name text,
  add column if not exists verifier_role text;

-- ---------------------------------------------------------------------------
-- record_entries gains `verified_by`
--
-- The newest `verified` decision, and only while the entry is still verified —
-- the same derivation the local adapter's `toEntry()` makes. Named verifier
-- first; a decision from a Roster account without a stored name falls back to
-- that profile's display name and title.
--
-- Appended as the last column, which is what `create or replace view`
-- requires. `security_invoker` is restated because replacing a view resets
-- its options.
-- ---------------------------------------------------------------------------

create or replace view record_entries
with (security_invoker = true)
as
select
  a.id,
  a.profile_id,
  a.kind,
  a.title,
  a.detail,
  a.sport,
  a.value_display,
  a.unit,
  a.competition,
  a.placement,
  a.field_size,
  a.location,
  a.achieved_on,
  a.verification,
  a.verified_at,
  a.is_pinned,
  o.name  as org_name,
  o.logo_url as org_logo_url,
  e.name  as event_name,
  (select count(*) from achievement_evidence ev where ev.achievement_id = a.id)
    as evidence_count,
  nullif(
    case
      when lv.verifier_name is not null then concat_ws(', ', lv.verifier_name, lv.verifier_role)
      else concat_ws(', ', lv.display_name, lv.title)
    end,
    ''
  ) as verified_by
from achievements a
left join organizations o on o.id = a.org_id
left join sport_events  e on e.id = a.event_id
left join lateral (
  select v.verifier_name, v.verifier_role, vp.display_name, vp.title
    from verifications v
    left join profiles vp on vp.id = v.verifier_id
   where v.achievement_id = a.id
     and v.outcome = 'verified'
   order by v.created_at desc
   limit 1
) lv on a.verification = 'verified';
