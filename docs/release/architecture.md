# Architecture handoff

**Last updated: 2026-09-11**

## Request and data flow

Public resume/search routes and signed-in workspace routes render through Next.js App Router. `src/proxy.ts` refreshes Supabase sessions or validates local cookies and gates `/app`, `/resume`, `/settings`, `/onboarding`, and `/lists`. Individual actions, repositories, and media routes enforce their own authorization; a route redirect is not the security boundary.

Core actions call `getRepository()` in `src/lib/data/index.ts`. Network actions call `getNetworkRepository()` in `src/lib/network/index.ts`, resolving the actor on the server. Both choose their adapter from `ROSTER_DATA` or Supabase configuration presence. Production rejects missing Supabase configuration and explicit local mode.

| Layer | Local development | Supabase deployment |
| --- | --- | --- |
| Identity | Signed session cookie and local users | Supabase Auth session, confirmed email checks |
| Resumes, claims, lists | `src/lib/data/local/repository.ts`, `roster.json` | `src/lib/data/supabase/repository.ts`, public-schema RLS and RPCs |
| Social network | `src/lib/network/local.ts`, `network.json` | `src/lib/network/supabase.ts`, `public.network_api`, private `roster_network` schema |
| Uploaded images | Private data-directory `media/` | Private `roster-media` Storage bucket |
| Retained report images | Restricted `network-evidence/` copies | Retained-object metadata and restricted Storage access |

The file adapter is a development fixture system, not a production deployment option. Keep the data directory outside static/public hosting.

## Important boundaries

- DOB lives in network membership data and is not part of public member summaries. Enrollment requires age 13 or older. Introduction requests to recipients under 18 require mutual follows; conversations must be accepted before ordinary replies. Blocking and suspension constrain network access.
- Roles offered at signup are athlete, coach, and recruiter. Staff is privileged and must be assigned by trusted server/database operations. Migration `0010_core.sql` protects profile authority fields and claim verification fields against self-service escalation.
- Legacy coaching authority requires verified, current coaching and athlete memberships. Membership trust-field writes now require a trusted database/service role; historical rows are preserved.
- Coach verification binds the recipient email, confirmed authenticated coach, and claim revision. Material claim edits invalidate earlier pending requests. The verification link cannot substitute for coach identity.
- Migration `0012_profile_privacy.sql` restricts direct contact-column reads and exposes visibility-checked `get_profile` reads. Contact email/phone are masked unless the viewer owns the profile, is staff, or the profile is both public and recruitable. Search uses the same projection. This application requires that RPC, so deploy the migration with the application.
- Migration `0011_network.sql` revokes direct anonymous/authenticated access to private network tables. Network operations pass through the actor-bound RPC, which validates membership and operation permissions.
- Uploads accept still JPEG, PNG, or WebP, with a 10 MB input limit and 40 megapixel decoder limit. `sharp` re-encodes images and strips source metadata. `/api/media/[userId]/[filename]` authorizes reads; private Storage must not be made public to fix an access problem.
- Report evidence has a dedicated staff-only media route. Account cleanup preserves restricted report evidence independently of ordinary account content. Resolved evidence expires after 90 days; an hourly external job must delete retained bytes and metadata. See [network operations](../../src/lib/network/OPERATIONS.md).

## Migration ownership

Migrations `0001`–`0009` describe the observed remote baseline. The restored `0008_coach_verification.sql` retains legacy profile title, membership verification fields, trigger, and peer policy; `0009_seed_sports.sql` restores the historical sports migration. See [remote observations](remote-schema-observation.md). `0010_core.sql` adds protected authority (including legacy membership trust fields), reserved `/app`, claim revisions, verification requests/RPCs, film featuring, and endorsement recipient controls. `0011_network.sql` adds network data, authorization, notifications, moderation, media ownership, and evidence retention support. `0012_profile_privacy.sql` adds the required masked profile RPC and contact-column grants.

These files describe the tested disposable database. They do not establish that the existing hosted project has the same baseline. Follow the [release preflight](README.md#database-preflight-and-rollout) before deployment. Handwritten database types must also be checked against the reconciled schema before replacing them with generated output.
