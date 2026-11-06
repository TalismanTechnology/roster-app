-- Roster · 0009 · Seed sports
--
-- `profiles.primary_sport`, `achievements.sport`, `film_clips.sport`, and
-- `memberships.sport` all reference `sports(slug)`. No prior migration ever
-- populated the table — local dev never noticed because local mode doesn't
-- enforce the foreign key — so onboarding against a real Supabase project
-- would fail the moment anyone picked a sport. This is that seed, kept in
-- lockstep with `src/lib/sports.ts`'s SPORTS list: the same slugs, so a
-- profile write never points at a sport this table doesn't have.

insert into sports (slug, name, category, is_timed) values
  ('football',      'Football',           'team_ball',   false),
  ('basketball',    'Basketball',         'team_ball',   false),
  ('soccer',        'Soccer',             'team_ball',   false),
  ('track_field',   'Track & Field',      'track_field', true),
  ('cross_country',  'Cross Country',     'track_field', true),
  ('baseball',      'Baseball',           'team_ball',   false),
  ('softball',      'Softball',           'team_ball',   false),
  ('volleyball',    'Volleyball',         'team_ball',   false),
  ('lacrosse',      'Lacrosse',           'team_ball',   false),
  ('swimming',      'Swimming & Diving',  'aquatics',    true),
  ('wrestling',     'Wrestling',          'combat',      false),
  ('hockey',        'Ice Hockey',         'team_ball',   false),
  ('tennis',        'Tennis',             'racket',      false),
  ('golf',          'Golf',               'individual',  false),
  ('rowing',        'Rowing',             'individual',  true),
  ('gymnastics',    'Gymnastics',         'individual',  false),
  ('other',         'Other',              'other',       false)
on conflict (slug) do nothing;
