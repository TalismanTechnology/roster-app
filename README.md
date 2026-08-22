# Roster

The private network for serious athletes. An athlete's accomplishments become
one verifiable record they can send to a recruiter — and a feed where that
record earns recognition.

Marketing site: [myroster.us](https://myroster.us)

## Why this stack

The build decision was between forking an existing open-source social network
and assembling one. Forking lost, for a specific reason: the federated options
(Mastodon, Misskey, Pixelfed, Lemmy) are all built on ActivityPub, which means
public, portable, unverifiable identity. Roster is private, invite-only, and
verified — the exact inverse. Adopting one would have meant months spent
removing its central premise.

What actually needed inheriting was the boring, hard infrastructure: auth,
media handling, session management, realtime. Supabase provides those as mature
open source. The parts that make Roster worth using — the record, verification,
the recruiter surface — do not exist in any project you could fork, so they get
written either way.

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Supabase** — Postgres, auth, storage, realtime
- **Tailwind CSS 4** with design tokens in `src/app/globals.css`

> Next.js 16 renamed `middleware.ts` to `proxy.ts`. Session refresh and route
> gating live in `src/proxy.ts`.

## Getting started

Requires **Node 22+** (`@supabase/supabase-js` has deprecated Node 20) and
PostgreSQL 16 locally if you want to run the schema tests.

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project values
npm run dev
```

Apply the migrations to your Supabase project in order — the SQL editor works,
or link the CLI and `supabase db push`:

```
supabase/migrations/
├── 0001_foundation.sql   extensions, enums, sports reference data
├── 0002_identity.sql     profiles, organizations, memberships, invites
├── 0003_record.sql       achievements, evidence, verifications  ← the product
├── 0004_social.sql       follows, posts, likes, comments
├── 0005_signals.sql      profile views, recruiter lists, notifications
├── 0006_security.sql     every RLS policy, in one auditable file
└── 0007_triggers.sql     counters, verification sync, notification fan-out
```

Then regenerate types so the client matches the database:

```bash
npm run db:types      # requires a linked Supabase project
```

## Testing the schema

The security model is the product's foundation, so it has real tests — 25
behavioral checks covering visibility, verification authority, counter
integrity, and invite redemption. They run against a throwaway Postgres
cluster; no Docker and no Supabase CLI required.

```bash
npm run test:schema
```

The suite is verified to fail: breaking the private-profile rule in
`0006_security.sql` makes it exit non-zero rather than passing quietly.

## Architecture notes

**Visibility has exactly one definition.** `can_view_profile()` in
`0006_security.sql` decides who can see a profile; achievements, posts,
memberships, and media all defer to it. Changing the privacy model means
changing one function, not auditing twenty policies.

**Verification is separate from the claim.** `achievements.verification` is a
cached copy of the newest row in `verifications`, kept current by trigger. The
audit trail stays authoritative, so "who vouched for this, when, and on what
basis" is answerable years later — which is the entire basis of Roster's
credibility. An athlete cannot verify their own record; the policy enforces it.

**Evidence is not public.** A recruiter sees the verified mark. The screenshot
behind it is visible only to the athlete, their coaches, and staff.

**The record is one table, not five.** A PR, an award, and a commitment share
almost all their columns, and the most-read query in the app is "this athlete's
entries, newest first". Splitting by kind would make that a five-way UNION.

## Routing

`/[handle]` is an athlete's record and is reachable without an account — RLS,
not the proxy, decides whether any row comes back. Any new top-level route
**must** be added to `APP_ROUTES` in `src/proxy.ts`, or it will be interpreted
as a handle.

## Not built yet

- Auth flows (`/sign-in`, `/sign-up`, invite redemption UI)
- Record editor — creating and editing achievements
- Recruiter search and saved lists
- Media upload pipeline
- Brand deals. Deliberately deferred: it needs real contract, payment, and
  FTC-disclosure modelling, and guessing at that shape before the recruiter
  side has usage would guess wrong.
