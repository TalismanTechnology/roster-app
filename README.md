# Roster

**Last updated: 2026-09-11**

Roster is a web application for athletes, coaches, and recruiters age 13 and older. It combines a shareable athletic resume with a signed-in network: posts, discovery, follows, introduction requests, conversations, notifications, coach verification, recruiting lists, and moderation. The existing landing hero is preserved.

This rebuild is implemented and validated locally. Hosted deployment remains gated on credentials, schema reconciliation, full Supabase integration tests, and operating setup. See the [release handoff](docs/release/README.md) for exact evidence and outstanding work.

## Local preview

Use Node.js 22 or newer; the recorded release build used Node 22.23.2.

```sh
npm ci
ROSTER_DATA=local npm run dev -- --port 3000
```

Open `http://localhost:3000`. If the development server already occupies port 3000, use that server rather than starting another. Local data is created on first use under `.data/`; no hosted credentials are required. `ROSTER_DATA=local` explicitly selects fixtures even if Supabase environment values exist. Production runtime deliberately rejects local data mode.

| Local identity | Email | Password |
| --- | --- | --- |
| Athlete | `jordanreyes@roster.local` or another seeded `<handle>@roster.local` | `roster-demo` |
| Coach | `coach@roster.local` | `roster-demo` |
| Recruiter | `recruiter@roster.local` | `roster-demo` |

All fixture identities are fictional. Existing accounts may be asked to enroll in the network with a date of birth at `/app/setup`. Fresh signup collects DOB and then completes role-specific onboarding. Public resume examples are available at `/jordanreyes` and `/preview`.

`npm run seed` resets the local core database, including account records; existing cookies may refer to removed accounts. It is destructive to local edits and does not reset all network/media state. For a fresh isolated demo, start the server with a new `ROSTER_DATA_DIR` outside version control. Never use local fixture accounts against a hosted database.

## Product and architecture

Public resumes support public, unlisted, and private visibility. Search lists public athletes. Signed-in users enter `/app`; athlete editing remains at `/resume`, recruiter lists at `/lists`, and account controls at `/settings`. Verification links require a confirmed, matching coach identity; owning a link alone does not authorize an attestation.

The stack is Next.js 16.3.4, React 19.2.8, Tailwind CSS 4, and TypeScript. Server Actions use core and network repository interfaces with local and Supabase implementations. Supabase mode uses Auth, Postgres authorization, identity-bound RPCs, and private Storage. Uploaded photos are normalized to WebP and served through authorized application routes.

| Area | Source |
| --- | --- |
| Landing and public resume | `src/app/page.tsx`, `src/app/[handle]/`, `src/components/record/` |
| Member workspace | `src/app/app/`, `src/components/network/` |
| Core data and authentication | `src/lib/data/`, `src/lib/actions/`, `src/lib/supabase/` |
| Network repositories and operations | `src/lib/network/` |
| Media and moderation evidence | `src/lib/media.ts`, `src/lib/network/evidence.ts`, `src/app/api/` |
| Session refresh and protected routes | `src/proxy.ts` |
| Database definitions and authorization tests | `supabase/migrations/`, `supabase/tests/` |

Read the installed Next.js guides in `node_modules/next/dist/docs/` before changing framework code, as required by [AGENTS.md](AGENTS.md). See [architecture](docs/release/architecture.md) for data flow and security boundaries.

## Checks

```sh
npm test
npm run lint -- --max-warnings=0
npm run typecheck
ROSTER_NEXT_OUTPUT=.next-release npm run build
npm run test:schema
```

The schema runner needs PostgreSQL tools (validated with PostgreSQL 16); set `PGBIN` if automatic discovery fails. It creates a disposable local database with Auth/Storage shims. It does not validate the full Supabase service stack. A separate build output keeps the development server's `.next` directory intact.

`npm run e2e -- --base=http://127.0.0.1:3000` is the local-only smoke runner and requires installed Chromium for `playwright-core`. Its rewritten journeys have not yet been validated as a complete CLI run. The [browser evidence record](docs/testing/e2e-local-2026-09-11.md) lists observed passes and unverified journeys. `npm run audit` and `npm run shots -- /preview` provide additional developer browser checks; their existence is not evidence that the current release passed them.

## Supabase setup

Use [environment.example](docs/release/environment.example) as a placeholder template for an ignored `.env.local`. Supply verified project values through your secret manager. Configuration detection checks value shape; it does not prove credentials work. The runtime requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the public client key and `SUPABASE_SERVICE_ROLE_KEY` only on trusted servers/jobs.

Do not blindly run `supabase db push` against the existing project. Read-only inspection confirmed remote migrations `0001`–`0009`; the two previously missing baseline files are now restored, and new work is numbered `0010`–`0012`. The complete hosted schema and service behavior still require staging verification. See the [remote observations](docs/release/remote-schema-observation.md). Follow the [migration and rollback procedure](docs/release/README.md#database-preflight-and-rollout) first. No hosted migration was applied during this rebuild.

The release also requires `0012_profile_privacy.sql`: the Supabase adapter reads profiles through its `get_profile` RPC, which enforces visibility and masks contact fields. Deploy the reconciled migrations through `0012` together with this application.

The final unit suite passed 57 tests in 16 suites. For local HTTP image validation against the running fixture server, run `ROSTER_DATA=local node --import tsx scripts/media-smoke.ts` with the same data directory/session configuration as the server. Nine HTTP status checks and image-normalization/header assertions passed; manual cropping UI remains unverified.
