# Roster App — Exhaustive Improvement Audit & Wave Plan

**Repo:** `TalismanTechnology/roster-app`  
**Working tree:** `/workspace/roster-app` on branch `feat/roster-improvements` (from `feat/dark-identity` @ `4df9ba3`)  
**Audit date:** Thursday Nov 5, 2026 (America/New_York)  
**Auditor:** Claude Code `claude` CLI v2.1.295 (read-only: Read/Glob/Grep) + Grok Bot coordination  
**Scope:** Phase 1 only — no application source mutations. Improvements doc lives outside the clone.

---


## Progress (updated Nov 6, 2026 ~12:40 AM America/New_York)

| Wave | Commit | Status | Notes |
|---|---|---|---|
| 1 | `daf8559` | done | tooling, typecheck, CI, env, hygiene |
| 2 | `1059369` | done | verification integrity, bugs, validation, search (unit tests 27→110) |
| 3 | `8be27c6` | done | security, mobile nav, a11y, caching, isolated e2e (unit tests 125; e2e all pass) |
| 4 | `dfeb7c2` | done | schema sync + RLS privilege guards; schema 36 checks; unit 130 |
| 5 | `266a63f` | done | verification_requests RPCs, hashed tokens, Resend/outbox email, dispute/batch UX; unit 155; e2e all pass (schema runner skipped — no local Postgres) |
| 6 | `66bb74e` | done | lists CRUD, admin deleteUser, password re-auth, email pending, forgot/reset, feature_film RPC, search positions+ILIKE escape, handle rate-limit; unit 175; e2e all pass |
| 7 | `8115fb3` | done | OG/Twitter cards, JSON-LD, sitemap shards, print QR, verification provenance, unlisted X-Robots-Tag, avatars (local+/0019), Suspense header, proxy cookie skip; unit 193; e2e 33/33 |
| 8 | `de9640e` | done | recruiter/coach onboarding, imperial measurables, sport events, film/coach edit, expired resend, search filters/sort, list notes/CSV, saved searches, viewer summary, richer rows; unit 224 |
| 9 | `c521c79` | done | rate limiting, privacy/terms, minors consent + contact masking, profile reporting/moderation, health/logger/Sentry hooks, launch checklist; unit 251; e2e all pass; audit no findings |

## Baseline health (captured this session)

| Check | Result |
|---|---|
| Clone | `gh repo clone TalismanTechnology/roster-app /workspace/roster-app` → default branch `feat/dark-identity` @ `4df9ba3` |
| Branch | `feat/roster-improvements` created, clean working tree, **no source files modified** |
| Install | `npm ci` succeeded (Node `v20.19.2` on box; `@supabase/supabase-js` wants Node ≥22 — EBADENGINE warning only) |
| `npx tsc --noEmit` | **FAIL (exit 1)** — 9 errors: missing global `PageProps`/`LayoutProps` on `[handle]`, `lists/[id]`, `resume`, `search`, `sign-in`, `verify/[token]`, `layout`; implicit `any` on resume page param `r` |
| `npm test` | **PASS 27/27** (local adapter unit tests only) |
| CI | **None** — no `.github/workflows` |
| Git migrations | `0001`–`0007` only |
| Live Supabase `gdwhsppzasjuyhrwnaoz` | Ahead: through `0011` + `0014` (posts/post_reactions, profiles.title, ncaa_id, measurables…). **No `verification_requests` table.** |
| Supabase adapter stubs | `deleteAccount`, by-link verification (`getVerificationRequest` / `respondToVerification`), and all lists methods throw `DataError("unavailable", …)` |
| Claude Code | Completed read-only audit → **118 concrete items** below |

### Typecheck error detail
```
src/app/[handle]/page.tsx(20,52): error TS2304: Cannot find name 'PageProps'.
src/app/[handle]/page.tsx(50,54): error TS2304: Cannot find name 'PageProps'.
src/app/layout.tsx(37,50): error TS2304: Cannot find name 'LayoutProps'.
src/app/lists/[id]/page.tsx(19,52): error TS2304: Cannot find name 'PageProps'.
src/app/resume/page.tsx(41,66): error TS2304: Cannot find name 'PageProps'.
src/app/resume/page.tsx(68,41): error TS7006: Parameter 'r' implicitly has an 'any' type.
src/app/search/page.tsx(41,60): error TS2304: Cannot find name 'PageProps'.
src/app/sign-in/page.tsx(15,60): error TS2304: Cannot find name 'PageProps'.
src/app/verify/[token]/page.tsx(26,54): error TS2304: Cannot find name 'PageProps'.
```
*(Root cause: Next 16 typed routes globals come from `.next/types` / `next typegen`, which is gitignored. Fix tracked as item #100.)*

### Biggest product risk (from audit)
Local-mode product works end-to-end. The Supabase path does not. Verification, lists, and account deletion are stubs; the view counter never fires; production has migrations that aren't in git. **"Verified" proves nothing today** because:
1. RLS lets users write protected columns (`account_kind='staff'`, `verification='verified'`).
2. The athlete holds the verification link and can self-verify signed out under any name.
3. Editing a verified entry keeps the coach badge on a mark the coach never saw.

---

## Master improvement list (118 items)

Labels: **[A–J]** dimension · **P0–P3** priority

### A. Critical Bugs, Edge Cases & Broken Flows

1. [x] [A] P0 — Editing a verified entry keeps the badge — `src/lib/data/local/repository.ts:207-213` `updateEntry`, `src/lib/actions/resume.ts:324-339`, `src/lib/data/supabase/repository.ts:128-133` — `Object.assign(row, patch)` leaves `verification`, `verified_at` and `verified_by` alone when the title, `value_display` or `achieved_on` changes. Fix: reset to `unverified` and expire pending requests when any substantive field changes (later mirrored as a BEFORE UPDATE trigger, see #36) — otherwise a coach's name sits on a mark they never confirmed.
2. [x] [A] P0 — Production silently falls back to the local JSON adapter — `src/lib/data/index.ts:14-18`, `src/proxy.ts:25-30`, `src/lib/supabase/config.ts:10-21` — if env vars are missing or still placeholders, prod boots `LocalRepository` with the seeded `roster-demo` passwords and writes to `.data/`, which is read-only on serverless. Fix: throw when `NODE_ENV==='production'` and the mode resolves to local, unless `ROSTER_DATA=local` is set explicitly.
3. [x] [A] P1 — Supabase view counting never runs — `src/lib/data/supabase/repository.ts:225-228` — `void this.client.rpc(...)` never calls `.then()`, and a PostgREST builder only sends its request when awaited, so no request goes out. Fix: `await` it inside `after(() => repo.recordView(...))` from `next/server`, called in `src/app/[handle]/page.tsx:69` — otherwise "views this week" stays at 0 in prod.
4. [x] [A] P1 — The landing renders whoever owns a hard-coded handle — `src/components/landing/ResumeDemo.tsx:12,21` — in Supabase mode, any real user who claims `jordanreyes` is featured on the homepage. Fix: render `src/lib/fixtures.ts` or a handle from an env allowlist.
5. [x] [A] P1 — `lists` isn't a reserved handle — `src/lib/handles.ts:13-44`, `supabase/migrations/0002_identity.sql:178-183` — `src/app/lists` is a route, so an athlete with that handle gets an unreachable resume. Also add `manifest`, `sitemap`, `robots`, `favicon`, `icon`. Fix: TS mirror, an additive `insert … on conflict do nothing`, and a unit test that compares the list with the top-level `src/app` folders.
6. [x] [A] P1 — React 19 form actions wipe input on validation errors — `src/components/editor/EditorForm.tsx:29-33`, `AuthForm.tsx`, `VerifyForm.tsx`, `AccountForms.tsx` — uncontrolled `<form action>` fields reset after every action, including a "Enter a full URL." error, so a half-typed entry is lost. Fix: return the submitted values in `FormState` and feed them back as `defaultValue`.
7. [x] [A] P1 — Onboarding will hit an FK violation on Supabase — `0002_identity.sql:24`, `0003_record.sql:24`, `0004_film.sql:37` — these reference `sports(slug)`, but no migration seeds `sports`. Only `supabase/tests/schema_test.sql:9` does, and `README.md` wrongly says 0001 has reference data. Fix: an idempotent seed migration for the 17 keys in `src/lib/sports.ts:7-25` (verify on live).
8. [x] [A] P1 — Future dates and placement > field size pass locally but fail in Postgres — `src/lib/actions/resume.ts:283-293` vs `0003_record.sql:60-65` — local mode accepts them; Supabase rejects them with a vague error. Fix: zod refines for both, plus `max={today}` on the date input in `editor/RecordSections.tsx:100`.
9. [x] [A] P2 — The owner's "references hidden" hint never shows — `src/components/record/RecordSections.tsx:260` — `isOwnerOnly` requires coaches with no email or phone, but `coach_reachable` (`0004_film.sql:96`) guarantees one. Fix: base it on `profile.visibility` and `is_recruitable`.
10. [x] [A] P2 — The verify link is displayed as a relative path — `editor/RecordSections.tsx:215-218`, `RequestVerification.tsx:31-41` — the visible `<code>/verify/…` is what users select by hand, and that copy is broken. Fix: render the absolute URL server-side.
11. [x] [A] P1 — Supabase writes ignore errors — `supabase/repository.ts:128-141,167-176,201-203` — `updateEntry`, `deleteEntry`, `setPinned`, `deleteFilm` and `deleteCoach` discard `{error}`, so an RLS-blocked or stale write still shows "Saved". Fix: check the error and the affected row count.
12. [x] [A] P2 — `featureFilm` isn't atomic on Supabase — `supabase/repository.ts:171-176` — the comment in `0004_film.sql:56-58` claims a transaction, but it's two PostgREST calls; a failure between them leaves no featured clip. Fix: a `feature_film(clip uuid)` RPC.
13. [x] [A] P2 — The local store can lose updates — `src/lib/data/local/store.ts:157-162` — read-modify-write with no lock, so concurrent actions (a coach verifying while the athlete edits) overwrite each other. Fix: a lockfile or in-process mutex.
14. [x] [A] P2 — No pin cap, and `togglePinned` can throw — `actions/resume.ts:355-365`; `Highlights` slices to 3 (`record/RecordSections.tsx:37`) — a 4th pin silently doesn't show. Fix: enforce a maximum of 3 and wrap in try/catch.
15. [x] [A] P2 — Sign-in ignores `next` and error params — `src/app/sign-in/page.tsx:16-19`, `sign-up/page.tsx` — a signed-in visitor always goes to `/resume`; `?error=confirmation` from `auth/callback/route.ts:28` is never shown; the sign-up link drops `next`.
16. [x] [A] P3 — Server-side redirects lose the destination — `actions/resume.ts:30-34`, `resume/page.tsx:43`, `onboarding/page.tsx:22` — `redirect("/sign-in")` without `next`.
17. [x] [A] P2 — Coach, brand and staff accounts land in the athlete editor — `resume/page.tsx:51` (only `recruiter` redirects), `SiteHeader.tsx:11-14`. Fix: test `account_kind !== 'athlete'`.
18. [x] [A] P2 — The search count is a guess — `search/page.tsx:143` shows "24+"; `page` (line 51) is unbounded, so `?page=9999` shows "No one matches". Fix: return `count(*) over()` from the RPC and clamp the page.
19. [x] [A] P3 — After a verification, the athlete's page isn't revalidated on Supabase — `actions/verify.ts:54-62` — `getVerificationRequest` returns null there, so `/${handle}` never revalidates. Fix: have `respondToVerification` return the handle.

### B. Supabase Adapter & Database/Migration Parity (0001–0014)

20. [x] [B] P0 — Bring live migrations into git — `supabase/migrations/` has 0001–0007; live has 0001–0011 and 0014 (posts, `title`, `measurables`…). Fix: `supabase migration fetch` / `db pull` into the repo as-is, document the 0012/0013 gap, never re-apply them — otherwise nobody can rebuild prod and `test:schema` tests a different schema.
21. [x] [B] P0 — Add a `verification_requests` table and definer RPCs — `src/lib/data/types.ts:48-66`, `supabase/repository.ts:205-221` — an additive migration with a token hash, status, expiry, verifier name/role and note, plus `SECURITY DEFINER get_verification_request(token)` / `respond_verification(...)`. `verifications_insert` (`0006_security.sql:201-213`) requires `verifier_id = auth.uid()`, which an anonymous coach can't meet.
22. [x] [B] P1 — `verified_by` is missing from the schema — `0003_record.sql:118-131`, `0005_signals.sql:94-121`, `database.types.ts:138-141`. Fix: add `verifications.verifier_name/verifier_role` and `create or replace view record_entries` with `verified_by` (additive).
23. [x] [B] P1 — Recruiter lists aren't wired on Supabase — `supabase/repository.ts:258-288` returns `[]` or throws, although the tables exist (`0005_signals.sql:52-77`). Fix: implement it, with `member_count` via `recruiter_list_members(count)`.
24. [x] [B] P1 — Regenerate `database.types.ts` — it's hand-written (`database.types.ts:1-12`) and missing live columns (`title`, `measurables`), the lists, verifications, sports and posts tables. Fix: `npm run db:types` plus a CI drift check.
25. [x] [B] P1 — Account deletion is a dead end on Supabase — `supabase/repository.ts:64-66`, `actions/account.ts:75-93` — the Settings form always errors. Fix: a `server-only` service-role module calling `auth.admin.deleteUser`; the cascade comes from `0002_identity.sql:10`.
26. [x] [B] P1 — `is_recruitable` defaults disagree — `0002_identity.sql:57` defaults to `true`; `local/repository.ts:596` and `seed.ts:133` use `false`. New Supabase athletes expose their coaches' phone numbers immediately. Fix: an additive `alter column … set default false`.
27. [x] [B] P2 — Insert parity gaps — local `addEntry` defaults `sport` to `primary_sport` (`local/repository.ts:181`); Supabase (`:114-119`) doesn't. Local sets `thumbnail_url` (`:259-262`); the `parse_film_url` trigger doesn't.
28. [x] [B] P1 — Supabase password change skips the current password — `supabase/repository.ts:59-62` — a hijacked session can rotate the password. Fix: re-authenticate with `signInWithPassword(current)` first.
29. [x] [B] P2 — Changing email on Supabase shows the wrong result — `supabase/repository.ts:54-57`, `AccountForms.tsx:11-24` — the UI says "Saved" while a confirmation is pending and keeps showing the old email. Fix: a pending state and copy that says so.
30. [x] [B] P1 — Leftover social tables on live — `posts`/`post_reactions` exist even though `0004_film.sql:7-9` says the social graph was removed. Fix: audit their RLS and grants (verify on live); revoke anon/authenticated access in an additive migration; decide whether to drop them later.
31. [x] [B] P2 — Search parity gaps — `athlete_positions` is hard-coded `null` (`supabase/repository.ts:250`) and ignored by `local/search.ts`. In `0007_triggers.sql:198-199`, user input in `q` isn't escaped for `%` and `_`.
32. [x] [B] P3 — `verifier_kind` mismatch — `local/store.ts:57` uses `coach|staff|self`; the enum (`0001_foundation.sql:50-55`) is `roster_staff|coach|organization|integration`.
33. [x] [B] P2 — Supabase sign-up error mapping — `supabase/repository.ts:37-41` maps every error to `conflict` and shows the raw message ("User already registered" lets anyone check which emails have accounts; a rate limit reads as a conflict).
34. [x] [B] P1 — No tests cover the Supabase adapter — run the `local-repository.test.ts` scenarios as shared contract tests against both adapters (local Supabase or a branch DB).

### C. Security, Auth, Privacy & Anti-Abuse

35. [x] [C] P0 — Any user can make themselves staff — `0006_security.sql:142-143` `profiles_update_self` allows `PATCH profiles set account_kind='staff'`; `is_staff()` (`:22-33`) then unlocks private resumes and all coach contacts. The same hole lets users clear `suspended_at` or set `verified_count` and `identity_verified_at`. Fix: a BEFORE UPDATE guard trigger on those columns (verify on live).
36. [x] [C] P0 — Athletes can verify themselves by direct write — `0006_security.sql:165-166` `achievements_write_own` allows `update achievements set verification='verified'`. Fix: a trigger that blocks changes to `verification`/`verified_at` except through `apply_verification`, and resets them when substantive fields change (#1).
37. [x] [C] P0 — The athlete can complete their own verification link — `src/lib/data/local/rules.ts:72-83` only blocks the athlete when signed in. The athlete gets the token (`RequestVerification.tsx`), opens it signed out, and types any name into `VerifyForm.tsx:47`. Fix: deliver the link only to `coach_contacts.email` (#75) or add an OTP, and display the stored coach name rather than the typed one.
38. [x] [C] P1 — Open redirect through a backslash — `actions/auth.ts:38-41`, `auth/callback/route.ts:16-17` — `/\evil.com` passes the `startsWith("/") && !startsWith("//")` check, and browsers treat `\` as `/`. Fix: resolve with `new URL(next, origin)` and require the same origin.
39. [x] [C] P1 — No rate limiting anywhere — `signIn`, `signUp`, `respondVerification`, `checkHandle`, and the anonymous `access_requests` insert (`0006_security.sql:295-296`). Fix: a per-IP limiter in the proxy or the actions.
40. [x] [C] P2 — The handle check reveals private resumes — `actions/resume.ts:121-126` confirms a private handle exists, which the 404 in `[handle]/page.tsx:14-17` is meant to hide. Fix: rate-limit it, and document the trade-off.
41. [x] [C] P1 — Tokens are stored in plaintext with no cap or revoke — `local/repository.ts:355`. Fix: store `sha256(token)`, cap pending requests per day, and add a "revoke link" action.
42. [x] [C] P2 — The token can leak through the Referer header — `verify/[token]/page.tsx:68` links out from a page whose URL contains the token. Fix: `referrer: 'no-referrer'` in that route's metadata, and keep `/verify` out of analytics.
43. [x] [C] P1 — No Content-Security-Policy — `next.config.ts:22-40`. Fix: a nonce-based CSP from the proxy (frame-src youtube-nocookie and player.vimeo; img-src `i.ytimg.com` and `*.supabase.co`). Also, HSTS `preload` is currently sent on preview hosts too.
44. [x] [C] P1 — Minors' contact data is exposed with no legal pages — `IdentityBand.tsx:41,107` puts `contact_email` in a raw `mailto` link, and `ProfileSections.tsx:174` collects a phone number. `/privacy` and `/terms` are reserved handles but don't exist as pages. Fix: add an age or guardian consent step, obscure the email (or use a contact form), and ship the legal pages.
45. [x] [C] P2 — Local sessions can't be revoked — `local/session.ts:45-62` — the `userId.hmac` cookie has no issued-at time or version, so a password change or account deletion doesn't end other sessions.
46. [x] [C] P3 — Sign-in timing reveals which emails exist (local) — `local/repository.ts:60-65` skips scrypt when there's no user. Fix: verify against a dummy hash.
47. [x] [C] P1 — No password reset — the sign-in page has no "Forgot password" link. Fix: `resetPasswordForEmail` → `/auth/callback?next=/settings`.
48. [x] [C] P2 — `.claude/settings.json` auto-approves everything and is committed — `.claude/settings.json:3-17` allows `Bash(*)` and `mcp__*`, and hooks auto-answer `AskUserQuestion` with "yes". Fix: move it to `settings.local.json` or scope it down.
49. [x] [C] P3 — IDs aren't validated as UUIDs — `actions/resume.ts:70` uses `z.string().min(1)`; `actions/lists.ts:68,87,111` use raw strings, so Postgres throws `22P02`. Fix: `z.uuid()`.
50. [x] [C] P2 — No moderation path — `suspended_at` exists (`0002_identity.sql:71`), but there's no "Report" link on `/[handle]` and no staff queue, so handle squatting and impersonation can't be handled.
51. [x] [C] P2 — Env handling is scattered — `proxy.ts:44-45` uses `!` non-null assertions while `server.ts` uses `requireEnv`; `local/session.ts:25-38` silently writes a secret file. Fix: a zod-parsed `src/lib/env.ts`, and require `ROSTER_SESSION_SECRET` in prod.

### D. Athlete Onboarding & `/resume` Workspace UX

52. [x] [D] P1 — Nobody can sign up as a recruiter or coach — `OnboardingForm.tsx` has no account type and `actions/resume.ts:81-93` hard-codes athlete; recruiters exist only in `seed.ts:152`. Fix: an "athlete / recruiter / coach" step, then a recruiter onboarding (name, program, title).
53. [x] [D] P1 — No avatar upload — `avatar_url` is never written. Fix: a Supabase Storage `avatars` bucket with owner-prefix RLS and client-side resizing (`remotePatterns` already allows `*.supabase.co`).
54. [x] [D] P1 — Measurables are entered in metric but shown in imperial — `ProfileSections.tsx:114-120` asks for cm/kg while `format.ts:112-127` displays ft/in/lbs. Fix: ft+in and lbs inputs, still stored as metric.
55. [x] [D] P1 — No sport-specific events or measurables — `sport_events` (`0001_foundation.sql:95-104`), `value_numeric`/`unit` (`0003_record.sql:31-33`) and the live `measurables` column are unused. Fix: per-sport templates (40-yard dash, vertical, 100m) that fill `value_numeric` and `unit`, so marks can sort and rank.
56. [x] [D] P1 — Film and references can only be deleted — `editor/RecordSections.tsx:252-268,309-321`. Fix: add edit, film reordering (`position`), and the coach `is_visible` toggle (`0004_film.sql:90`), which has no UI today.
57. [x] [D] P2 — Destructive actions have no confirmation — `RowAction` Delete (`editor/RecordSections.tsx:207,266,319`) removes even verified entries instantly. Fix: a two-step confirm.
58. [x] [D] P2 — Gaps in the request flow — `editor/RecordSections.tsx:202` offers requests only for unverified or disputed entries; there's no resend or revoke for submitted ones; `RequestsSection.tsx:25` hides expired requests, so the athlete never learns a link expired.
59. [x] [D] P2 — Onboarding accessibility and defaults — `OnboardingForm.tsx:64-78`: `aria-current` sits on a span, focus doesn't move to the new step, Enter doesn't advance, and the disabled Continue (`:193`) has no explanation attached. Sport defaults to football (`:129`).
60. [x] [D] P2 — Positions are free text — `ProfileSections.tsx:98-100`. Fix: per-sport position chips, which would also make the RPC's position filter usable.
61. [x] [D] P3 — The checklist misses trust signals — `Checklist.tsx:21-66`. Fix: add "1+ verified entry" and "photo" items.
62. [x] [D] P3 — The live preview uses CSS `zoom: 0.55` — `resume/page.tsx:165` — this skews the container-query layout. Fix: a scale transform with an explicit width.
63. [x] [D] P2 — Unsaved edits are lost silently — switching sections with `?section=` discards typing. Fix: a dirty guard and a "Saved · 2m ago" indicator.
64. [x] [D] P3 — Social handles aren't normalized — `actions/resume.ts:219-220` accepts "@x" or full URLs. Fix: normalize to a handle.

### E. Public Athlete Profile (`/[handle]`) & Shareability/SEO

65. [x] [E] P1 — No OG images and no `metadataBase` — there's no `src/app/[handle]/opengraph-image.tsx`, and `layout.tsx:15-30` lacks `metadataBase`, so OG URLs are relative. Fix: an `ImageResponse` with name, sport, class year, verified count and the top three pinned marks, plus a Twitter card.
66. [x] [E] P1 — Socials, Hudl and results links are collected but never shown — `ProfileSections.tsx:178-191`; nothing in `components/record` renders them. Fix: a links row in `IdentityBand` with `rel="me nofollow noopener"`.
67. [x] [E] P2 — No structured data — add `ProfilePage`/`Person` JSON-LD on public resumes only.
68. [x] [E] P1 — The display host is hard-coded as `roster.us` — `IdentityBand.tsx:71`, `resume/page.tsx:82`, `settings/page.tsx:45`, `OnboardingForm.tsx:84,104`, `robots.ts:21`. No production URL is confirmed. Fix: one helper that reads `NEXT_PUBLIC_SITE_URL`.
69. [x] [E] P2 — The sitemap stops at 100 athletes — `sitemap.ts:15`. Fix: `generateSitemaps` with pagination and revalidation.
70. [x] [E] P3 — Print/PDF output is basic — add a QR code to the live URL and a "verified as of" date to the print stylesheet (`globals.css:511`).
71. [x] [E] P2 — The badge shows no provenance — `RecordList` shows only "Verified by X". Fix: add the date, the coach's role and organization, and a "how verification works" explainer; give "Disputed" an explanation for recruiters.
72. [x] [E] P3 — No native share on mobile — `ShareBar.tsx:12-21` only copies to the clipboard. Fix: use `navigator.share` with copy as the fallback.
73. [x] [E] P3 — Unlisted pages rely on HTML metadata alone — add an `X-Robots-Tag: noindex, noarchive` header for unlisted responses.
74. [x] [E] P3 — Empty resumes are indexable — `RecordList` (`record/RecordSections.tsx:79-93`). Fix: `noindex` until there's at least one entry.

### F. Coach Verification Flow (`/verify/[token]`)

75. [x] [F] P0 — Roster should send the verification email — `RequestVerification.tsx:14-18` ("Roster doesn't send the email"). Fix: Resend/Postmark to `coach_contacts.email`, Reply-To the athlete, reminders on day 3 and day 10, and an expiry notice. This also enables the fix for #37.
76. [x] [F] P1 — Every coach link will 404 on Supabase — `verify/[token]/page.tsx:31` calls `notFound()`, and the adapter's `getVerificationRequest` always returns null. Fix: a proper "link not valid" state instead of the generic 404.
77. [x] [F] P1 — A dispute is a dead end — the note appears in `RequestsSection`, but there's no "fix entry and ask again" button, and the "Disputed" chip stays public after the athlete corrects the entry (ties to #1).
78. [x] [F] P1 — Coach identity capture — `VerifyForm.tsx:46-51` lets the name be overwritten. Fix: store the typed name separately, display the coach-contact record, and add an attestation checkbox with terms copy.
79. [x] [F] P3 — Anyone opening an answered link within two minutes sees "Thank you" — `verify/[token]/page.tsx:121` (`isFresh`). Fix: rely on the action state and show "Already answered" otherwise.
80. [x] [F] P2 — The athlete isn't told when a coach answers. Fix: an email plus a badge in the editor.
81. [x] [F] P2 — One link per entry — add a page per coach that lists all of that athlete's pending entries to verify in one sitting.
82. [x] [F] P2 — Layering issue — `verify/[token]/page.tsx:12` imports `canRespondToRequest` from `lib/data/local/rules`. Fix: move shared rules to `lib/data/rules`, or have the repository return `allowed`.
83. [x] [F] P2 — Coaches can't say "I don't know this athlete" — add that option on the verify page; it marks the request disputed and flags it for staff.

### G. Recruiter Discovery (`/search`) & Lists (`/lists`)

84. [x] [G] P1 — Search makes one lists query per row — `search/page.tsx:69-71` calls `listsContaining` per athlete (24 round trips on Supabase). Fix: `listsContainingMany(ownerId, ids[])`.
85. [x] [G] P1 — Recruiters can't filter or sort by much — `search/page.tsx:94-137` has no position, minimum GPA or measurable filters, and no sort control, though the RPC already supports positions (`0007_triggers.sql:173,193`).
86. [x] [G] P2 — List access and notes — `actions/lists.ts` doesn't check account type while the UI hides lists from athletes (`search/page.tsx:67`); decide the rule. `recruiter_list_members.note` (`0005_signals.sql:70`) has no UI.
87. [x] [G] P2 — The state filter is free text — `search/page.tsx:122-124`, so "Texas" silently returns nothing. Fix: a state select.
88. [x] [G] P3 — Add saved searches with a weekly digest of new verified athletes.
89. [x] [G] P2 — List management basics are missing — CSV export, rename, move between lists, and removing an athlete from the search row (`SaveToList` only shows "In X").
90. [x] [G] P2 — Athletes see only a raw view count — `profile_views.viewer_id` exists (`0005_signals.sql:29`). Fix: an opt-in "3 college coaches viewed" summary.
91. [x] [G] P3 — Search rows are thin — `AthleteRow` (`search/page.tsx:177-210`) lacks a photo, top verified mark and height/weight.
92. [x] [G] P3 — Search queries aren't normalized — `q` length is unbounded and LIKE wildcards aren't escaped. Fix: cap the length and require 2+ characters for fuzzy matching.

### H. Design System, Accessibility & Mobile Polish

93. [x] [H] P1 — On phones, signed-in users can't reach Settings or Sign out — `SiteHeader.tsx:67-85` hides those links (plus Find athletes and Lists) below 640px. Fix: a mobile menu sheet.
94. [x] [H] P1 — JS animations ignore reduced motion — `bits/ScrollVelocity.tsx:124`, `landing/ImageRevealBackground.tsx:92` (a requestAnimationFrame loop), `bits/Magnet.tsx`. Fix: gate on reduced motion and pause when offscreen.
95. [x] [H] P2 — Status meaning lives only in `title` tooltips — `VerificationMark.tsx:49`, and the dot/circle markers at `resume/page.tsx:134` and `Checklist.tsx:115`. Fix: screen-reader text.
96. [x] [H] P2 — Errors aren't tied to fields — `ui/fields.tsx:17-33`: no `aria-describedby` or `aria-invalid`, and only one error per form. Fix: per-field errors from zod's flatten.
97. [x] [H] P2 — Error handling is thin — `error.tsx:12` drops the error and digest; there's no `global-error.tsx` and no custom not-found for `/lists/[id]`.
98. [x] [H] P3 — No app icons; starter files remain — `manifest.ts` has no icons, there's no `app/icon`/`apple-icon`, and unused starter SVGs sit in `public/` (`file`, `globe`, `next`, `vercel`, `window`).
99. [x] [H] P3 — Dev placeholder art can show in prod — `ui/Img.tsx:58-99` renders "IMG 04 · label" when an image fails to load. Fix: a neutral fill in prod.

### I. Performance, Next.js 16 Architecture & Code Quality

100. [x] [I] P1 — Make `tsc` pass — the `PageProps`/`LayoutProps` globals come from `.next/types` and `next-env.d.ts`, which are gitignored. Fix: `"typecheck": "next typegen && tsc --noEmit"`, and type the implicit `any` on the resume page.
101. [x] [I] P1 — The same data is fetched several times per request — `[handle]/page.tsx:20-23` and `:50-54`, plus `Site.tsx:34-47`. On Supabase that's 3+ `getUser` network calls per view. Fix: wrap these lookups in React `cache()`.
102. [x] [I] P2 — Every page is dynamic — the landing (`page.tsx:26`) and `Site` read cookies, so nothing public can be cached. Fix: move the user part of the header into a Suspense island, then `use cache` on public resumes with `revalidateTag`.
103. [x] [I] P1 — Actions only revalidate `/resume` — `actions/resume.ts:183,212,245,270,320…`. Fix: a `revalidateProfile(handle)` helper that also covers `/[handle]` and `/search`.
104. [x] [I] P2 — The proxy calls Supabase `getUser` on every public hit — `proxy.ts:41-73`. Fix: skip it when there's no `sb-` cookie.
105. [x] [I] P3 — Dead and duplicate code — `format.ts:43-51` `sportLabel` duplicates `sportName`; `lib/supabase/server.ts:47-54` `getCurrentUser` is unused; `str`, `failed` and `requireUser` are copied across four action files.
106. [x] [I] P3 — Enum lists are duplicated — `LEVELS`/`KINDS` in `actions/resume.ts:76-79,278-281` repeat `format.ts`'s `LEVEL_OPTIONS`/`KIND_OPTIONS`. Fix: derive from one source.
107. [x] [I] P2 — No `server-only` guards — on `lib/data/auth.ts` (whose comment says server-only), `lib/data/local/*`, or the future service-role module.

### J. Testing, Tooling, CI/CD & Production Launch Readiness

108. [x] [J] P0 — No CI — add GitHub Actions: `npm ci`, typecheck (with typegen), tests, build, `test:schema` with a Postgres service, and e2e on `next start` in local mode with a temp data dir, on Node 22.
109. [x] [J] P1 — `.env.example` is gitignored — `.gitignore` has `.env*`, but `README.md` and `config.ts:4` reference the file. Fix: `!.env.example` plus the file (Supabase URL and anon key, `SITE_URL`, `ROSTER_DATA`, `ROSTER_SESSION_SECRET`, service-role key, email key).
110. [x] [J] P1 — Node version isn't pinned — `package.json` has no `engines` and there's no `.nvmrc`; `@types/node` is ^20; this box runs Node 20.
111. [x] [J] P1 — No linting — add `eslint-config-next` with jsx-a11y and react-hooks, and run `npm run lint` in CI.
112. [x] [J] P1 — Schema tests don't cover the new guards — `supabase/tests/schema_test.sql` has nothing for self-escalation, direct verification writes, verification RPCs or the sports seed.
113. [x] [J] P1 — E2E runs against shared data — `scripts/smoke.mjs` writes to the shared `.data` (leftover "Smoke list …" rows) and needs a manually started server. Fix: a temp data dir and a spawned server; add negative cases (editing resets the badge, signed-out self-verify fails, the backslash redirect).
114. [x] [J] P2 — The audit script misses routes — `scripts/audit.mjs:21-35` skips `/verify/[token]`, `/onboarding` and `/lists/[id]`. Fix: add them and use axe-core for contrast and ARIA.
115. [x] [J] P3 — `shots.mjs` is stale — it hard-codes `localhost:3000` (`:38`) and still drives a `--tab` interface (`:41`) the editor no longer has.
116. [x] [J] P2 — No unit tests for actions — `safeNext`, `achievementSchema` and `coachSchema` are untested.
117. [x] [J] P2 — No observability — no error reporting (Sentry or Vercel), no structured action logs, no uptime check.
118. [x] [J] P1 — Launch checklist — pick the domain (roster.us vs myroster.us, `README.md:7`), set Supabase Auth redirect URLs, custom SMTP and templates, backups/PITR, per-environment Vercel env vars, and the legal pages.

---

## Wave plan (Claude Code implementation waves)

Waves 1–3 need **no remote database work** and are safe to ship as PRs against `feat/roster-improvements`.

### Wave 1 — Tooling & hygiene (start immediately)
Items: **100, 108, 109, 110, 111, 105, 106, 107, 115, 48, 51**  
Goal: green typecheck script, CI skeleton, `.env.example`, Node pin, eslint, dead-code cleanup, safer Claude/settings + env parsing. Pure code/config. No DB.

### Wave 2 — Correctness & local-adapter parity (code only)
Items: **1 (local + action side), 2, 3, 4, 5 (TS mirror + test), 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 46, 49, 79, 82, 84, 87, 92, 66, 68, 74**  
Goal: verified-entry invalidation on edit, prod local-fallback guard, view-count await, reserved handles, form state retention, zod date/placement, write-error checks, redirects/`next`, search count, site URL helper, socials render. Still no destructive remote DB.

### Wave 3 — App-layer security, a11y, mobile & test hardening
Items: **38, 42, 43, 45, 57, 59, 61, 62, 63, 64, 93, 94, 95, 96, 97, 98, 99, 72, 101, 103, 113, 114, 116**  
Goal: open-redirect fix, referrer policy, CSP, session versioning, confirm-delete, mobile nav, reduced-motion, ARIA, smoke/e2e isolation, action unit tests. Still no remote schema writes.

### Wave 4 — Supabase schema sync (additive only)
Items: **20, 24, 7, 26, 30, 32, 35, 36, 22, 112, 34** + migration half of **5**  
Goal: pull live `0008`–`0014` into git (never re-apply), seed sports, fix `is_recruitable` default, revoke social leftover grants, BEFORE UPDATE guard triggers for staff/verification columns, regenerate types, schema tests. **Additive migrations only — no destructive remote ops.**

### Wave 5 — Verification-by-link on Supabase + email
Items: **21, 37, 41, 75, 76, 77, 78, 80, 81, 83**  
Goal: `verification_requests` table + SECURITY DEFINER RPCs, hashed tokens, Resend delivery to coach email, anti-self-verify, dispute recovery UX.

### Wave 6 — Finish Supabase adapter & account flows
Items: **23, 25, 27, 28, 29, 31, 33, 40, 47, 12**  
Goal: lists CRUD, service-role deleteUser, password re-auth, email pending state, featureFilm RPC, search parity, password reset.

### Wave 7 — Shareability, SEO, Storage & caching
Items: **65, 67, 69, 70, 71, 73, 53, 102, 104**  
Goal: `opengraph-image.tsx` + Twitter cards, JSON-LD, sitemap pagination, QR/print, avatar Storage bucket, Suspense islands / cache tags, skip proxy getUser when no cookie.

### Wave 8 — Recruiter features & athlete depth
Items: **52, 54, 55, 56, 58, 60, 85, 86, 88, 89, 90, 91**  
Goal: account-type onboarding, imperial measurables UI, sport-specific events, film reorder/edit, search filters/sort, list notes/CSV, richer rows.

### Wave 9 — Launch readiness
Items: **39, 44, 50, 117, 118**  
Goal: rate limiting, privacy/terms + minors consent, report/moderation path, observability, domain/Auth/SMTP/PITR/Vercel env checklist.

---

## Counts

| Area | Items |
|---|---|
| A — Critical bugs | 19 |
| B — Supabase parity | 15 |
| C — Security and privacy | 17 |
| D — Onboarding and `/resume` | 13 |
| E — Public profile and SEO | 10 |
| F — Coach verification | 9 |
| G — Search and lists | 9 |
| H — Design and accessibility | 7 |
| I — Performance and architecture | 8 |
| J — Testing, CI and launch | 11 |
| **Total** | **118** |

| Priority | Items |
|---|---|
| P0 | 9 |
| P1 | 45 |
| P2 | 43 |
| P3 | 21 |

---

## Ready for Wave 1

- Branch: `feat/roster-improvements` @ `4df9ba3` (clean; zero Phase 1 source diffs)
- Doc: `/workspace/roster-app-improvements.md` (this file)
- Claude Code available: `/home/box/.local/bin/claude` v2.1.295 (Lucas Max plan)
- Recommended Wave 1 kickoff prompt focus: items **100, 108, 109, 110, 111** first (typecheck script + CI + `.env.example` + engines/`.nvmrc` + eslint), then **105–107, 115, 48, 51**

**Do not touch** `TalismanTechnology/Roster` (trailer). Work only in `roster-app`.


---

## Completion summary (Waves 1–9)

All **118** improvements are implemented on `feat/roster-improvements`.

| Wave | Commit | Focus |
|---|---|---|
| 1 | `daf8559` | tooling, typecheck, CI, env, hygiene |
| 2 | `1059369` | verification integrity, core bugs, validation, search |
| 3 | `8be27c6` | security hardening, mobile nav, a11y, caching, isolated e2e |
| 4 | `dfeb7c2` | Supabase migration parity (`0008`–`0016`), RLS privilege/verification guards, types |
| 5 | `266a63f` | verification_requests RPCs, hashed tokens, Resend/outbox email, dispute/batch UX |
| 6 | `66bb74e` | lists CRUD, account lifecycle, password reset, search parity |
| 7 | `8115fb3` | OG/Twitter cards, JSON-LD, print QR, avatars, Suspense header, proxy perf |
| 8 | `de9640e` | recruiter/coach onboarding, imperial measurables, sport events, search filters, list notes/CSV |
| 9 | `c521c79` | rate limiting, privacy/terms, minors consent, profile reporting, health/logger, launch docs |

**Final verification (local, Wave 9):** `npm run typecheck` ✓ · `npm run lint` ✓ · `npm test` **251/251** · `npm run build` ✓ · `npm run e2e` all steps ✓ · `npm run audit` **no findings** · migrations `0008`–`0021` in git.

**Out of scope / not done by this PR:** applying migrations to live Supabase `gdwhsppzasjuyhrwnaoz`, touching `TalismanTechnology/Roster`, or flipping production env vars — see `docs/LAUNCH-CHECKLIST.md`.
