# Roster

A digital resume for athletes. Every PR, result, award, and clip of film —
verified by coaches — at one link a recruiter can open without an account.
Think Hudl's profile page, taken seriously: the record is verifiable, the
academics are on it, and the coach a recruiter would call is listed.

Marketing site: [myroster.us](https://myroster.us)

## The product in one loop

1. An athlete signs up and claims `roster.us/<handle>`.
2. They build the resume: record entries, film links, academics, references.
3. They send a coach a verification link; the coach answers with one tap and
   their name goes on the entry. The verified count is the resume's credibility.
4. Recruiters find athletes at `/search` — by sport, level, class year,
   state — or open the link the athlete sent them. No recruiter account needed.
   Signed-in recruiters keep lists.

Visibility is the athlete's call: **public** (listed in search, indexable),
**unlisted** (anyone with the link, findable by no one), or **private**.
Coach contact details additionally require the resume to be public and the
athlete to be open to recruiting.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** — Server Components
  and Server Actions throughout; the public pages ship almost no client JS.
- **A repository interface** with two adapters: **Supabase** (Postgres, auth,
  RLS) for production and a **local file-backed adapter** for development.
- **Tailwind CSS 4** with the design tokens in `src/app/globals.css` — dark
  only, hairlines and corner brackets, system type, no webfonts.

> Next.js 16 renamed `middleware.ts` to `proxy.ts`. Session handling and the
> (small) authenticated surface live in `src/proxy.ts` — the site is public by
> default and only `/resume`, `/settings`, `/lists`, and `/onboarding` require
> a session.

## Getting started

Requires **Node 22+** (`@supabase/supabase-js` has deprecated Node 20; Node 20
works with warnings).

```bash
npm install
npm run dev
```

That's it. **Without Supabase credentials the app runs in local mode**: the
whole product works against `.data/roster.json`, seeded on first run with a
fictional roster across four sports.

| Sign in as | Email | Password |
|---|---|---|
| any seeded athlete | `<handle>@roster.local` — e.g. `jordanreyes@roster.local`, `avareyes@roster.local` | `roster-demo` |
| a recruiter (has lists) | `recruiter@roster.local` | `roster-demo` |
| a coach | `coach@roster.local` | `roster-demo` |

`npm run seed` rebuilds the local database from `src/lib/data/local/seed-data.ts`.
Every name in it is fictional.

### Supabase mode

Copy `.env.example` to `.env.local`, fill in the project values, and the app
switches to the Supabase adapter automatically (`ROSTER_DATA=local|supabase`
forces either). Apply the migrations in order — the SQL editor works, or link
the CLI and `supabase db push`:

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

The Supabase adapter (`src/lib/data/supabase/repository.ts`) compiles
against the hand-written types but has not been exercised against a live
project since the local adapter landed. Verification-by-link and recruiter
lists need small additions there (see the comments in that file).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm run typecheck` | Production build / `tsc --noEmit` |
| `npm test` | Unit tests for the data layer: the visibility rules, the local adapter, sessions, film URLs |
| `npm run e2e` | Drives the whole product loop in a browser against a dev server — 16 steps, both account kinds, the coach link |
| `npm run audit` | Every route at 320/375/768/1024/1440 + print: overflow, console errors, alt text, control names, labels, heading order |
| `npm run shots [route]` | Screenshots one route at four widths into `.shots/` |
| `npm run seed` | Rebuild `.data/roster.json` |
| `npm run test:schema` | Schema tests against a local PostgreSQL (`brew install postgresql@16`) |

## Where things live

```
src/
├── proxy.ts                    session check + the authenticated surface
├── app/
│   ├── page.tsx                the landing
│   ├── [handle]/               the public resume
│   ├── preview/                the resume against fixtures, no database
│   ├── search/                 discovery (filters live in the URL)
│   ├── resume/                 the athlete's editor, with live preview
│   ├── verify/[token]/         a coach's verification page (no account)
│   ├── lists/                  recruiter lists
│   ├── settings/               account
│   └── sign-in | sign-up | onboarding | auth/
├── components/
│   ├── landing/                the landing sections
│   ├── record/                 the resume document (shared by /[handle], /preview, the editor's preview)
│   ├── editor/                 editor sections and forms
│   ├── search/ · lists/ · account/ · verify/ · auth/
│   ├── shell/                  header, footer, Site wrapper
│   ├── bits/                   React Bits pieces used on the landing (client-only)
│   └── ui/                     marks (brackets, checker, globe, verified), buttons, fields, images
└── lib/
    ├── data/
    │   ├── repository.ts       the interface every page and action uses
    │   ├── local/              file-backed adapter: store, session, rules (RLS mirrored), seed
    │   ├── supabase/           the Supabase adapter
    │   └── auth.ts             getCurrentUser / sign in / sign out, in whichever mode is running
    ├── actions/                every Server Action (auth, resume, verify, lists, account)
    ├── handles.ts              reserved-handle mirror of migration 0002
    └── sports.ts · format.ts · film.ts
```

The visibility model has exactly one definition per adapter:
`supabase/migrations/0006_security.sql` for Postgres and
`src/lib/data/local/rules.ts` for local mode. They must answer "who can see
this" identically; `npm test` checks the local one.
