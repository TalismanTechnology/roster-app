# Release handoff

**Last updated: 2026-09-11**

The Roster rebuild is a locally implemented web application for athletes, coaches, and recruiters age 13 and older. It is not yet cleared for production deployment or native app-store submission. The existing landing hero is frozen; its source files are unchanged.

Work targets branch `codex/roster-platform`, based on `origin/feat/dark-identity` at `4df9ba33bfebdf86cadd6f09786f2ce75274265f`. The existing Supabase project reference is `gdwhsppzasjuyhrwnaoz`. No hosted migration, reset, or production seed was performed during implementation.

## Validation evidence

These results were recorded during the rebuild; they do not imply full hosted integration coverage.

| Check | Recorded outcome | Scope / limitation |
| --- | --- | --- |
| `npm test` | 57 tests in 16 suites passed | Core data, network, media, cover privacy, and contact masking checks |
| `npm run lint -- --max-warnings=0` | Passed, zero warnings | Static linting |
| `npm run typecheck` | Passed | Generated route types and TypeScript validation |
| `ROSTER_NEXT_OUTPUT=.next-release npm run build` | Passed; 26 static pages generated | Next 16.3.4, React 19.2.8, Node 22.23.2; build used environment wrapper and approved Turbopack execution escalation; compilation does not validate production credentials |
| Dependency audit | Zero vulnerabilities reported after updates | Point-in-time dependency database result |
| `supabase/tests/run.sh` | Passed: all 12 migrations, 32 schema checks plus network suite | Disposable PostgreSQL 16, authenticated-role SQL tests with local Auth/Storage shims; restored remote baseline included |
| Local browser journeys | Partial passes | See [exact browser evidence](../testing/e2e-local-2026-09-11.md); includes fresh teen athlete/coach/recruiter signup, signup draft retention, achievement editor reset/share behavior, post publish/edit/comment/like and rejected-film correction, introduction acceptance/reply, verification, list note persistence, and mobile member/workspace behavior |
| Local HTTP media smoke | Nine status checks plus image/header assertions passed | Actual local Next.js server; normalization, resizing, EXIF stripping, upload/read denial, attached-image access, deletion revocation; manual cropping UI untested |
| Rewritten smoke CLI | Syntax checked; complete run not yet established | Do not report all smoke journeys passed |
| Real hosted Supabase integration | Blocked | Retrieved candidate keys returned HTTP 401 `Invalid API key`; no verified runtime credentials |

The ignored `.env.supabase.local` contains candidate values only. Its presence is not proof of working credentials; do not copy values into reports, logs, or source control. Obtain and validate the intended public and server keys securely before using Supabase mode.

The later local browser rerun passed rejected-film correction and keyboard clearing with a successful save. Remaining browser limitations include a timed-out list removal interaction and unexecuted teen-contact, wrong-coach-email, manual image-cropping UI, and production Supabase journeys. Fresh teen athlete signup and local HTTP uploads subsequently passed. Final mobile workspace/Preview captures were completed with no horizontal overflow. Refer to the evidence record for subsequent updates rather than inferring success from unit tests.

## Preview and environment

Follow the [root setup instructions](../../README.md#local-preview) for the fixture preview on port 3000. Node 22+ and `npm ci` are required. Local fixture passwords are `roster-demo` and must never become hosted credentials.

Use [environment.example](environment.example) for variable names and placeholders. Configure production with `ROSTER_DATA=supabase`, the verified Supabase URL and public client key, a server-only service key for privileged cleanup, and the approved HTTPS `NEXT_PUBLIC_SITE_URL`. Do not deploy placeholder or rejected keys. Local mode deliberately fails under a production runtime.

Build and start with the same output-directory setting after staging has valid configuration:

```sh
ROSTER_NEXT_OUTPUT=.next-release npm run build
ROSTER_NEXT_OUTPUT=.next-release npm run start -- --port 3001
```

These are staging/production runtime commands, not a local-fixture preview. Keep the development preview on port 3000. Configure reverse proxy/hosting body limits to accommodate the application's 10 MB image uploads, then verify those limits end to end.

## Database preflight and rollout

1. Obtain authorized, working project access and verify the target project reference. Export the migration ledger and a read-only schema inventory: tables, columns/types/defaults, constraints, triggers, functions and signatures, grants, RLS policies, extensions, Auth settings, Storage buckets and policies. Read-only SQL inspection already confirmed the migration ledger and selected schema details described in [remote observations](remote-schema-observation.md). Complete the remaining inventory; those observations do not substitute for a full schema comparison.
2. Take a timestamped recoverable database backup and a separate backup/inventory of Storage object bytes. Preserve the current application artifact/configuration and Auth configuration. Record backup location, owner, retention, and recovery point. Restore into a disposable staging environment and verify row counts and representative object downloads before authorizing production changes.
3. Compare that restored schema to the repository baseline `0001`–`0009`. Remote versions `0001`–`0007` match; `0008_coach_verification.sql` and `0009_seed_sports.sql` have been restored from the remote ledger statements. New work is numbered `0010`–`0012` to avoid collisions. Produce reviewed additive reconciliation SQL for the actual differences; do not replay all baseline migrations, reset the project, seed live data, or mark migrations applied merely to silence the CLI.
4. Check for an existing owner of handle `app`. Migration `0010` intentionally aborts on that conflict. No `app` owner existed at the 2026-09-11 UTC read-only inspection; repeat this check immediately before rollout. Resolve routing with the owner rather than renaming a handle implicitly. Confirm all tables, policy names, enums, and function dependencies used by `0010`/`0011`/`0012` exist with compatible definitions.
5. Apply the reviewed reconciliation and `0010`/`0011`/`0012` in restored staging first. Deploy `0012_profile_privacy.sql` with this application: profile reads require its `get_profile` RPC and masked contact projection. The migrations contain non-idempotent object creation, so track applied versions and do not rerun them blindly. Exercise the hosted-role and service tests below using staging users. Review schema-generated types in a temporary output before updating `src/lib/database.types.ts`; the linked CLI target must be verified.
6. Once staging and recovery rehearsal pass, approve the specific production SQL and application artifact together. Use a maintenance window or a verified compatibility rollout, take a final recovery point, record migration outcomes, and run immediate post-deployment health and authorization checks. No production rollout has been executed by this rebuild.

## Remaining release gates

| Gate | Required acceptance evidence |
| --- | --- |
| Credentials and schema | Working verified keys, reviewed live inventory/diff, restored backup, successful reconciled staging migration |
| Supabase Auth | Approved Site URL and callback allowlist, custom SMTP/delivery configuration, actual email confirmation, sign-in/out, recovery and password reset, rejection of unsafe return URLs |
| Real backend roles | Anonymous, athlete, coach, recruiter, staff, blocked, suspended, unconfirmed, and under-18 cases against real Supabase Auth/PostgREST/Storage |
| Verification and lists | Matching/wrong coach identity, claim edits/replays/expiry, private scouting notes, list removal, contact masking, direct profile-column access denial, and cross-account access |
| Network and media | Fresh athlete signup, DOB age gate, teen mutual-follow contact restriction, request acceptance/decline, block/suspend, publish correction, image upload/ownership/read denial, account deletion |
| Moderation and retention | Trusted staff assignment, report review and retained-image isolation, delete-account evidence survival, expiry byte deletion and retry behavior |
| Browser regression | Stable rerun of unresolved browser journeys and complete smoke; mobile navigation, keyboard/accessible controls, empty/error states and upload behavior |
| Operations and policy | Domain owner approval, monitoring/alerts, recovery drill, support/moderation owner and procedures, privacy/terms/community/retention policy review |

Audit existing staff accounts and privileged organization memberships before launch; earlier schemas permitted self-managed roles. Migration `0010` now requires verified, current coaching relationships for legacy evidence and endorsement access. Historical peer verification writes require a trusted server/database operation; the new email-bound achievement workflow is independent.

No UI control may grant staff authority. Assign and audit staff roles through an approved trusted server/database process, then verify a normal user cannot escalate through profile or network APIs.

## Retention and operations

Install an external hourly scheduler using Node 22 and securely injected production credentials:

```sh
node --import tsx scripts/prune-report-evidence.mjs
```

The job needs `ROSTER_DATA=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. It is not installed or scheduled by this repository. A scheduler using `pg_cron` alone does not delete Storage bytes. Alert on nonzero exits, missed runs, repeated Storage failures, and cleanup backlog. Verify success with expired staging fixtures and retained-byte absence, not just a successful process exit.

Resolved reports become unavailable to staff at 90 days. The job deletes expired retained image bytes before pruning metadata; retry markers preserve cleanup work. Unresolved reports remain retained. Document ownership and approved retention/support policy before launch. See [network operations](../../src/lib/network/OPERATIONS.md) for implementation-specific cleanup behavior.

Monitor application errors, Auth failures/delivery, database and Storage failures, upload rejections, and moderation/retention failures without logging secrets, DOBs, private message content, or report evidence. Name the on-call/support owner and confirm alert delivery before enabling public signup.

## Rollback and recovery

There is no automated down migration. Prefer a tested forward fix for compatible additive changes. Before rollout, record the last known-good application artifact and the exact pre-change database/Storage recovery point.

If post-deployment authorization or integrity checks fail, stop affected writes/signup, preserve diagnostic metadata, and roll back the application only if the prior version is compatible with the migrated schema. Do not drop new tables or attempt ad hoc reverse SQL on production.

If database restoration is necessary, the operator must execute the previously rehearsed provider restore procedure into the approved target, restore matching Storage bytes/configuration separately, and verify Auth, record counts, ownership/RLS, private media, and retained report evidence before reopening writes. Database backups alone do not establish recoverability of uploaded files. Record the recovered point and any writes lost after it; reconcile those changes through the support process. The exact provider restore action remains a gate until backup facilities and access are verified for this project.

See [architecture](architecture.md) for repository boundaries and the [browser validation record](../testing/e2e-local-2026-09-11.md) for evidence that must accompany release approval.
