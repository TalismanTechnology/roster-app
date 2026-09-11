# Network operations

`getNetworkRepository()` resolves identity on the server. Never instantiate the local adapter with user input in an action. Local mode persists social rows in `network.json`, private DOB in its membership rows, and restricted report image copies in `network-evidence/`. These paths must not be served as static assets. Post uploads are separate under `media/`.

Supabase migration `0011_network.sql` installs a private schema, atomic identity-bound RPC, private `roster-media` bucket and image ownership checks. Apply migrations through the normal deployment process. No migration was applied to a live project during implementation.

## Report retention job

Production requires an external **hourly** scheduler with the application's Node22 runtime and secrets. No scheduler is configured by this repository. Run:

```sh
node --import tsx scripts/prune-report-evidence.mjs
```

Set `ROSTER_DATA=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` on the job. In local mode, set `ROSTER_DATA=local` and the same `ROSTER_DATA_DIR` as the application. Do not expose the service key to browser code or logs.

Resolved reports stop appearing to staff at 90 days. The job deletes expired retained image bytes through the Storage API before pruning metadata. Ordinary network writes also remove expired report metadata; retained-object markers keep byte cleanup retryable if metadata has already expired. Unresolved report evidence remains until resolved. Failures exit nonzero and must alert the operator. Installing pg_cron alone does not schedule this job or delete Storage bytes.

Account deletion first removes social data, preserving the immutable suspended membership marker until auth deletion. Local reports already hold restricted image copies. Supabase service cleanup records and detaches retained report image ownership, skips those objects while deleting ordinary uploads, then deletes auth. Retained objects are inaccessible through ordinary media RLS even to their former owner. `readReportImage` independently requires active staff and an unexpired report; any HTTP wrapper must return `Cache-Control: private, no-store` and never redirect to a public URL.

## Validation

`node --import tsx --test src/lib/network/__tests__/*.test.ts` tests local behavior. `bash supabase/tests/run.sh` creates a disposable PostgreSQL database and runs both legacy and network authorization tests under real authenticated roles. It needs PostgreSQL16 tools and permission to create local sockets/shared memory.
