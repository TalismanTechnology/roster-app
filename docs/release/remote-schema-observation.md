# Remote schema observations

**Last updated: 2026-09-11 UTC**

Read-only inspection used the Supabase SQL editor for existing project `gdwhsppzasjuyhrwnaoz`. The migration ledger's complete SQL statements for the two missing historical migrations were retrieved and restored as local files. No hosted migration, schema write, reset, or seed was performed.

## Observed baseline

| Observation | Result |
| --- | --- |
| Remote versions `0001`–`0007` | Names match the repository baseline |
| Remote version `0008` | `coach_verification`; statements restored as `supabase/migrations/0008_coach_verification.sql` |
| Remote version `0009` | `seed_sports`; statements restored as `supabase/migrations/0009_seed_sports.sql` |
| Additional profile column | `profiles.title` |
| Additional membership columns | `memberships.verified_at`, `memberships.verified_by` |
| Legacy membership trigger | `memberships_guard_verify_only` |
| Legacy membership policy | `memberships_verify_peer` |
| Existing `app` profile handle | Not occupied at inspection; recheck before migration |

The historical coach-verification fields, trigger, and peer policy remain part of the baseline. The rebuild's `0010_core.sql` adds a separate authority guard covering membership identity, organization, role, and legacy verification fields, preventing ordinary self-service writes from bypassing trust protections. Existing attestations are not implicitly rewritten.

## Reconciled extension sequence

| New migration | Responsibility |
| --- | --- |
| `0010_core.sql` | Core authority, membership trust protection, verification requests and related changes |
| `0011_network.sql` | Network data, identity-bound RPC, private media, moderation and retention |
| `0012_profile_privacy.sql` | Required `get_profile` RPC and masked contact projection |

These extension numbers avoid collisions with the remote baseline. The application requires `0012` for profile reads. Contact values are available only to the owner, staff, or viewers of a profile that is both public and recruitable; profile visibility checks still apply.

## Limits and next evidence

This read-only inspection improves baseline knowledge but is not a complete schema or runtime certification. Candidate REST API keys still returned HTTP 401 `Invalid API key`. No verified-backup restore, full staging reconciliation, or real Supabase Auth/PostgREST/Storage role test has been completed.

The disposable PostgreSQL suite passed across the restored `0001`–`0009` baseline plus new `0010`–`0012` (32 schema checks and the network suite); see the current result in the [release validation table](README.md#validation-evidence). Even a passing shim-based run cannot establish hosted service behavior. Follow the [database preflight](README.md#database-preflight-and-rollout), preserving historical data and avoiding blind baseline replay.
