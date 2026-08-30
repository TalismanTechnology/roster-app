-- Roster · 0004 · Film and references
--
-- What a recruiter does after reading the record: watch the athlete move, then
-- call someone who has coached them. Hudl owns the first of those and does
-- nothing with the second; a resume that carries both is the whole pitch.
--
-- This file replaces the social graph that stood here previously. Roster is a
-- resume, not a feed, and follows/posts/likes/comments were answering a
-- question nobody using it for this is asking.

-- ---------------------------------------------------------------------------
-- film_clips
--
-- Several clips, each labelled, rather than the single `hudl_url` a profile
-- already carries. The difference matters to the viewer: "Junior season
-- highlights" and "Full game vs. Central" are watched by different people with
-- different amounts of time, and a bare link forces a coach to guess which
-- they are getting.
--
-- `provider` and `external_id` are derived on write by the trigger in 0007 so
-- rendering never has to parse a URL, and so an unrecognised host degrades to
-- an honest outbound link instead of a broken embed.
-- ---------------------------------------------------------------------------

create table film_clips (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,

  title         text not null,
  url           text not null,
  provider      text,               -- 'youtube', 'hudl', 'vimeo', or null
  external_id   text,               -- provider's video id, when parseable
  thumbnail_url text,

  -- What the clip shows, so a coach can pick without playing all of them.
  season        text,               -- '2026', 'Junior year'
  sport         text references sports(slug) on delete set null,
  duration_s    integer,

  -- Athlete curation. One clip leads the profile; the rest sit behind it.
  is_featured   boolean not null default false,
  position      smallint not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint film_title_present check (nullif(btrim(title), '') is not null),
  constraint film_url_is_web check (url ~* '^https?://'),
  constraint film_duration_sane check (duration_s is null or duration_s between 1 and 86400)
);

-- The profile's film strip, in the athlete's chosen order.
create index film_clips_profile_idx on film_clips (profile_id, position, created_at);

-- At most one featured clip per athlete. A partial unique index rather than a
-- trigger: the database refuses the second one outright, so the editor's
-- "make this the lead clip" can unset-then-set inside one transaction and
-- never leave two behind.
create unique index film_clips_one_featured_idx
  on film_clips (profile_id) where is_featured;

create trigger film_clips_updated_at
  before update on film_clips
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- coach_contacts
--
-- The reference a recruiter calls. Deliberately not a Roster account: the
-- coach who can vouch for a high school junior is usually not going to sign up
-- for anything, and requiring it would mean the field stays empty.
--
-- Distinct from `coach_endorsements` in 0003, which is a written testimonial
-- from a coach who does have an account. This is a phone number.
-- ---------------------------------------------------------------------------

create table coach_contacts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,

  name        text not null,
  role        text,                 -- 'Head Coach', 'Recruiting Coordinator'
  org_id      uuid references organizations(id) on delete set null,
  org_name    text,                 -- free text when the org is not on Roster
  email       citext,
  phone       text,

  -- Contact details are shown only when the athlete says so, and never on a
  -- resume the athlete has not made public. Enforced in 0006.
  is_visible  boolean not null default true,
  position    smallint not null default 0,

  created_at  timestamptz not null default now(),

  constraint coach_name_present check (nullif(btrim(name), '') is not null),
  constraint coach_reachable check (email is not null or phone is not null)
);

create index coach_contacts_profile_idx
  on coach_contacts (profile_id, position) where is_visible;
