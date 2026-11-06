-- Roster · 0014 · Posts grants (reconstructed placeholder)
--
-- RECONSTRUCTED — DO NOT RE-APPLY TO LIVE.
--
-- Version 0014 is recorded live with NULL statements, and 0012/0013 were never
-- applied (the gap is real, not a missing file). What 0014 originally did is
-- unknown. The observable state it leaves is that `anon` and `authenticated`
-- hold every table privilege on the posts tables — TRUNCATE included — so this
-- file reproduces exactly that, and a local rebuild starts from the same bad
-- state production is in. 0015 is the fix, and is the migration meant to run
-- live.

grant all on table posts, post_reactions to anon, authenticated;
