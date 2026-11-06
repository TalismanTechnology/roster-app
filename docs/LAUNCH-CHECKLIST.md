# Launch checklist

Everything between "the branch is green" and "real athletes are on it." Work
top to bottom; each box is one person-checkable thing. Production Supabase
project: **`gdwhsppzasjuyhrwnaoz`**. Nothing in this repo touches it on its own:
every step that changes it is run by a person, here.

> Conventions: `$PROD` is the canonical origin decided in §2 (for example
> `https://myroster.us`). "SQL editor" means Supabase Dashboard → SQL Editor on
> `gdwhsppzasjuyhrwnaoz`. Run migrations **in order**, one at a time, reading
> each header first.

---

## 0. Before anything: the branch is green

- [ ] On the release commit: `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e && npm run audit` — all pass.
- [ ] `npm run test:schema` passes against a local Postgres (applies 0001–0021 from scratch).
- [ ] `git status` is clean; the commit is pushed.

## 1. Git branches: `main` vs `feat/dark-identity`

Today the remote default (`origin/HEAD`) is `feat/dark-identity`, and feature
waves land on `feat/roster-improvements`.

- [ ] Merge `feat/roster-improvements` → `feat/dark-identity` (PR, review, squash or merge — team's call).
- [ ] Create `main` from `feat/dark-identity` at the release commit: `git push origin feat/dark-identity:main`.
- [ ] GitHub → Settings → Branches: set the **default branch to `main`**; protect it (PR required, status checks required, no force-push).
- [ ] Vercel → Project → Settings → Git: **Production Branch = `main`**. Every other branch (including `feat/dark-identity`) deploys as a Preview.
- [ ] Decide whether `feat/dark-identity` is retired or kept as the integration branch; write it in the README.

## 2. Canonical domain: `myroster.us` vs `roster.us`

The code defaults to `https://roster.us` (`src/lib/site.ts`) and the mail
sender defaults to `noreply@myroster.us` (`src/lib/email`). Pick **one**
canonical origin before launch — resume links get printed on paper (QR codes)
and indexed, so changing it later breaks real links.

- [ ] Decide: **canonical = `________`** (the domain you control *and* will keep).
- [ ] Vercel → Domains: add the canonical apex and `www`; make `www` → apex a 308.
- [ ] If both domains are owned, add the other as a **308 redirect to canonical** (Vercel domain redirect), path-preserving, so `othername/<handle>` still lands.
- [ ] DNS: apex `A`/`ALIAS` and `www` `CNAME` per Vercel; wait for the certificate.
- [ ] Set `NEXT_PUBLIC_SITE_URL=$PROD` (§3). It drives robots.txt, the sitemap, OG/JSON-LD URLs, printed QR codes, verify links, and the handle prefix shown in onboarding.
- [ ] Update `src/lib/site.ts` `DEFAULT_SITE_URL` and the README if the canonical is not `roster.us`.
- [ ] Confirm the legal contact inboxes in `src/lib/legal.ts` (`privacy@…`, `safety@…`) exist on the canonical mail domain and are monitored.

## 3. Vercel environment variables (Production)

Set in Vercel → Settings → Environment Variables, scope **Production** (and
Preview where noted). Every variable is read through `src/lib/env.ts`;
`.env.example` documents each.

| Variable | Value | Notes |
| --- | --- | --- |
| `ROSTER_DATA` | `supabase` | Production must never fall back to local demo data. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://gdwhsppzasjuyhrwnaoz.supabase.co` | Preview: a separate project or branch DB, not prod. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → API → anon | Public by design; RLS is the guard. |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → API → service_role | **Server-only, Production only.** Never `NEXT_PUBLIC_`. Without it, account deletion reports itself unavailable. |
| `NEXT_PUBLIC_SITE_URL` | `$PROD` | No trailing slash. Preview: leave unset or the preview URL. |
| `RESEND_API_KEY` | Resend → API keys | Without it nothing is emailed (outbox file only). |
| `EMAIL_FROM` | `Roster <noreply@$DOMAIN>` | Domain must be verified in Resend (§6). |
| `SENTRY_DSN` | optional | Error forwarding (§8). |
| `ROSTER_ALERT_WEBHOOK_URL` | optional | Slack/Discord-compatible JSON webhook (§8). |
| `ROSTER_LOG_LEVEL` | `info` | Default; `warn` to quiet. |
| `ROSTER_RATE_LIMIT` | *(unset)* | Unset = on in Supabase mode. Never `off` in production. |
| `ROSTER_DEMO_HANDLE` | *(unset)* | Only with that athlete's written consent. |

- [ ] **Do not set** `ROSTER_SESSION_SECRET`, `ROSTER_DATA_DIR` in production (local mode only).
- [ ] Redeploy after changing variables (they are read at build and at runtime).

## 4. Supabase: apply migrations 0015 → 0021

The live project has 0001–0011 and a placeholder 0014 recorded (see the 0014
header: 0012/0013 were never applied; **do not re-apply 0014**). 0015 onwards
are additive and written to run live.

- [ ] **Backup first**: confirm PITR is on (§7) and note the current timestamp, or take a manual backup (Database → Backups).
- [ ] See what is recorded: `select version, name from supabase_migrations.schema_migrations order by version;`
- [ ] Apply, in order, each not yet recorded — paste the file into the SQL editor, run, check for errors, then record it:
  - [ ] `0015_security_guards.sql` — column guards on profiles/achievements, posts lockdown, reserved handles.
  - [ ] `0016_verified_by.sql`
  - [ ] `0017_verification_requests.sql` — hashed-token RPCs.
  - [ ] `0018_adapter_parity.sql`
  - [ ] `0019_avatars.sql` — creates the `avatars` storage bucket + policies.
  - [ ] `0020_recruiter_depth.sql` — saved searches, search sort, viewer summary.
  - [ ] `0021_launch_hardening.sql` — age/guardian consent columns, `profile_reports`, `report_profile()`, `set_profile_suspension()`.
- [ ] After each: `insert into supabase_migrations.schema_migrations (version, name) values ('00NN', '<name>');` — or use `supabase db push` from a machine linked to the project, which does both (it will try to apply anything unrecorded, so check the list first).
- [ ] Regenerate types and diff: `npm run db:types` → `git diff src/lib/database.types.ts`. Expected: no meaningful drift from the hand-written types. Commit if it changed.
- [ ] Smoke the RPCs as anon (SQL editor, `set role anon;`): `select search_athletes(null);` works; `select * from profile_reports;` returns permission denied / zero rows.

## 5. Supabase Auth

Dashboard → Authentication.

- [ ] **URL Configuration → Site URL** = `$PROD`.
- [ ] **Redirect URLs** (allow list), exactly:
  - `$PROD/auth/callback`
  - `$PROD/auth/callback?next=/reset-password` (covered by the wildcard below, listed for clarity)
  - `$PROD/**` *(optional wildcard; prefer the explicit entries)*
  - `https://*-<vercel-team>.vercel.app/auth/callback` for previews, **only** if previews use this project (they should not).
- [ ] **Email confirmations**: decide on/off. If on, sign-up shows "check your email" (`confirmEmail`) and the link lands on `/auth/callback`.
- [ ] **Email templates**: point the Confirm / Reset / Change-email templates' links at `{{ .SiteURL }}/auth/callback?...` (the defaults do), and edit the copy to say "Roster".
- [ ] **SMTP** (§6): Authentication → SMTP Settings → enable custom SMTP so auth mail comes from your domain, not Supabase's rate-limited sender.
- [ ] **Rate limits** (Authentication → Rate Limits): keep defaults or tighten; the app's own limits (§9) sit in front.
- [ ] **Password policy**: minimum 8 (matches the app); consider leaked-password protection.

## 6. Email: Resend

- [ ] Resend → Domains: add the canonical mail domain; add the SPF, DKIM (and DMARC) records it shows; wait for **Verified**.
- [ ] Create an API key (sending access, that domain only) → `RESEND_API_KEY`.
- [ ] `EMAIL_FROM` uses that domain.
- [ ] Supabase SMTP (§5): host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender = same From.
- [ ] Send yourself: a verification request, a coach answer, a password reset. All arrive, not in spam, links point at `$PROD`.

## 7. Backups and data safety

- [ ] **PITR** enabled (Dashboard → Database → Backups → Point in Time Recovery; requires a paid plan + compute add-on). Retention ≥ 7 days; the privacy page says deleted data rolls off backups within 30 days — keep retention ≤ 30.
- [ ] Do one restore drill to a scratch project before launch; write down how long it took.
- [ ] Service-role key: stored only in Vercel Production env and a password manager; rotate it if it was ever pasted elsewhere (Dashboard → API → Reset).
- [ ] Database password rotated from whatever was used during development.
- [ ] Network restrictions / SSL enforcement on (Database → Settings) if your plan allows.

## 8. Avatars bucket

- [ ] After 0019: Storage → `avatars` exists, **public**, 512 KB limit, `image/jpeg, image/png, image/webp` only.
- [ ] Upload a photo in the editor in production; it shows on the resume and the share card.
- [ ] `next.config.ts` `images.remotePatterns` allows `*.supabase.co/storage/v1/**` (it does) and CSP `img-src` includes `https://*.supabase.co` (it does).

## 9. Observability

- [ ] `GET $PROD/api/health` → `200` with `"status": "ok"` and `"dataMode": "supabase"`. `degraded` means a warn-level check (see `checks`); `503` means broken.
- [ ] Uptime monitor (Better Stack, UptimeRobot, Vercel checks…) on `/api/health`, alert on non-200 for 2+ minutes.
- [ ] Error forwarding: set `SENTRY_DSN` and/or `ROSTER_ALERT_WEBHOOK_URL`. Verify by visiting a broken route on a preview with the same env, or temporarily from a REPL: server errors arrive via `src/instrumentation.ts`, client render errors via `/api/errors`.
- [ ] Vercel → Logs: confirm JSON lines (`{"level":…,"event":…}`); add a log drain if you keep logs longer than Vercel does.
- [ ] Vercel Analytics / Speed Insights: optional; if added, update the CSP `connect-src` and the privacy page.

## 10. Rate limiting

In-memory, per instance (`src/lib/rate-limit.ts`). A speed bump in front of
Supabase's own auth limits, not a wall.

| Surface | Budget |
| --- | --- |
| Sign-in | 30 / 10 min per IP, 10 / 10 min per email |
| Sign-up | 10 / hour per IP |
| Password reset | 10 / 15 min per IP, 3 / 15 min per email |
| Handle checker | 60 / min and 600 / hour per IP |
| Coach verify answer | 40 / 10 min per IP, 15 / 10 min per link |
| Profile report | 6 / hour per IP, 2 / day per IP per resume (+ 20 / day per account in the DB) |
| `/api/health` | 120 / min per IP |
| `/api/errors` | 10 / min per IP |

- [ ] `ROSTER_RATE_LIMIT` is unset in production (limits on). It is bypassed automatically for `NODE_ENV=test` and `ROSTER_DATA=local` (the e2e and audit runs).
- [ ] Optional, recommended: Vercel Firewall rate-limit rule on `POST /sign-in`, `/sign-up`, `/forgot-password`, `/verify/*` as the cross-instance layer.

## 11. Moderation (#50)

Anyone can report a resume from its page; reports land in `profile_reports`
(staff-only RLS). There is no admin screen yet — staff use SQL.

- [ ] Grant staff to the moderators (service role / SQL editor only — the 0015 guard blocks everyone else):
  `update profiles set account_kind = 'staff' where id = '<uuid>';`
- [ ] Review open reports:
  ```sql
  select r.created_at, p.handle, r.reason, r.detail, r.reporter_id
    from profile_reports r join profiles p on p.id = r.profile_id
   where r.status = 'open' order by r.created_at desc;
  ```
- [ ] Suspend (hides the resume everywhere: page 404, search, sitemap, share card; resolves its open reports):
  `select set_profile_suspension((select id from profiles where handle = '<handle>'), true);`
- [ ] Reinstate: `select set_profile_suspension((select id from profiles where handle = '<handle>'), false);`
- [ ] Dismiss a report: `update profile_reports set status = 'dismissed', resolved_at = now() where id = '<uuid>';`
- [ ] A staff account in the app can also call the `setProfileSuspension` server action (`src/lib/actions/moderation.ts`). Local mode: `npm run moderate -- reports | suspend <handle> | reinstate <handle>`.
- [ ] Someone owns the `safety@` inbox and checks reports daily; minor-safety reports same day.

## 12. Privacy, minors, legal

- [ ] `/privacy` and `/terms` reviewed by counsel (they are written plainly on purpose; keep it that way). Bump `LEGAL_UPDATED` in `src/lib/legal.ts` on any change.
- [ ] Confirm the stated minimum age (13) and the parent/guardian attestation flow fit the launch markets (COPPA in the US; GDPR-K if EU users).
- [ ] New athletes attest age/guardian consent at onboarding (`profiles.age_consent`, `consent_at`). Decide what to do with pre-0021 accounts (null attestation): prompt on next edit, or leave.
- [ ] Contact details: confirm a signed-out visitor on a public resume sees "Request contact" and a masked hint, never `mailto:` (view source); a signed-in recruiter sees the Contact button.

## 13. SEO and sharing

- [ ] `$PROD/robots.txt` lists `$PROD/sitemap/…` shards; Search Console: add the property, submit the sitemap index.
- [ ] Open a public resume's share card (`/<handle>/opengraph-image`) — 200, PNG. Private/unlisted/suspended — 404.
- [ ] HSTS preload: `next.config.ts` adds `preload` only on the Vercel production deploy. Submit to hstspreload.org **only** once the canonical domain is final (it is hard to undo).

## 14. Go / no-go

- [ ] Sign up as a new athlete on `$PROD`: onboarding (with age attestation) → editor → add an entry → request verification → coach email arrives → verify → badge shows.
- [ ] Sign up as a recruiter: search, save, list, CSV export, reveal contact.
- [ ] Forgot password end to end.
- [ ] Delete that test account; its resume 404s.
- [ ] `/api/health` green; error sink receives a test event; uptime monitor armed.
- [ ] Rollback plan written: Vercel "Promote previous deployment"; PITR restore point noted from §4.
