# Roster

A digital resume for athletes. Every PR, result, award, and clip of film —
verified by coaches — at one link a recruiter can open without an account.
Think Hudl's profile page, taken seriously: the record is verifiable, the
academics are on it, and the coach a recruiter would call is listed.

Marketing site: [myroster.us](https://myroster.us)

## The product in one loop

1. An athlete signs up and claims `roster.us/<handle>`.
2. They build the resume: record entries, film links, academics, references.
3. A coach verifies entries; the verified count is the resume's credibility.
4. Recruiters find athletes at `/search` — by sport, level, class year,
   state — or open the link the athlete sent them. No recruiter account needed.

Visibility is the athlete's call: **public** (listed in search, indexable),
**unlisted** (anyone with the link, findable by no one), or **private**.
Coach contact details additionally require the resume to be public and the
athlete to be open to recruiting.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** — Server Components
  and Server Actions throughout; the public pages ship almost no client JS.
- **Supabase** — Postgres, auth, storage. All authorization is row-level
  security in the database, not application code.
- **Tailwind CSS 4** with design tokens in `src/app/globals.css`.

> Next.js 16 renamed `middleware.ts` to `proxy.ts`. Session refresh and the
> (small) authenticated surface live in `src/proxy.ts` — the site is public by
> default and only `/resume`, `/settings`, and `/onboarding` require a session.

## Getting started

Requires **Node 22+** (`@supabase/supabase-js` has deprecated Node 20) and
PostgreSQL 16 locally if you want to run the schema tests.

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project values
npm run dev
```

Without Supabase credentials the app still runs: `/preview` renders the full
resume against fixtures, and nothing gates.

Apply the migrations to your Supabase project in order — the SQL editor works,
or link the CLI and `supabase db push`:

```
supabase/migrations/
├── 0001_foundation.sql   extensions, enums, sports reference data
├── 0002_identity.sql     profiles, reserved handles, organizations
├── 0003_record.sql       achievements, evidence, verifications  ← the product
├── 0004_film.sql         film clips, coach references
├── 0005_signals.sql      profile views, recruiter lists
├── 0006_security.sql     every RLS policy, in one auditable file
└── 0007_triggers.sql     counters, film-URL parsing, athlete search
```

Then regenerate types so the client matches the database:

```bash
npm run db:types      # requires a linked Supabase project
```

## Schema tests

```bash
npm run test:schema   # needs a local PostgreSQL install (brew install postgresql@16)
```

Spins up a throwaway Postgres, applies every migration, and runs the
behavioral suite in `supabase/tests/schema_test.sql` — 28 checks that exercise
RLS as real roles: unlisted resumes open by link but stay out of search,
evidence stays private, athletes can't verify themselves, reserved handles are
refused, anonymous views count.

## Where things live

```
src/
├── proxy.ts                    session refresh + the authenticated surface
├── app/
│   ├── [handle]/               the public resume
│   ├── search/                 discovery (filters live in the URL)
│   ├── resume/                 the athlete's editor
│   ├── sign-in|sign-up|onboarding|auth/
│   └── preview/                fixtures, no database
├── components/
│   ├── record/                 public resume rendering
│   ├── editor/                 editor sections
│   ├── auth/                   auth + onboarding forms
│   └── ui/                     form primitives
└── lib/
    ├── actions/                every Server Action (auth.ts, resume.ts)
    ├── handles.ts              reserved-handle mirror of migration 0002
    └── supabase/               client factories
```
