import { applySuspension } from "../src/lib/data/local/moderation";
import { mutate, readDb } from "../src/lib/data/local/store";

/**
 * Operator moderation for LOCAL mode (#50) — the shell stand-in for staff
 * tooling until there is an admin screen. Works on $ROSTER_DATA_DIR
 * (default ./.data) while the server runs: the store writes atomically and
 * the app reads fresh on every request.
 *
 *   npm run moderate -- reports                 open reports, newest first
 *   npm run moderate -- suspend <handle>        hide the resume (404 to all but owner/staff)
 *   npm run moderate -- reinstate <handle>      lift the suspension
 *
 * In Supabase mode this file does nothing; use the SQL in
 * docs/LAUNCH-CHECKLIST.md § Moderation (set_profile_suspension, 0021).
 */

const [command, handle] = process.argv.slice(2);

function usage(): never {
  process.stderr.write("usage: npm run moderate -- reports | suspend <handle> | reinstate <handle>\n");
  process.exit(2);
}

if (process.env.ROSTER_DATA === "supabase") {
  process.stderr.write("Supabase mode: run `select set_profile_suspension('<profile id>', true);` as staff or in the SQL editor.\n");
  process.exit(2);
}

if (command === "reports") {
  const db = readDb();
  const open = db.profile_reports.filter((r) => r.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (open.length === 0) process.stdout.write("No open reports.\n");
  for (const r of open) {
    const p = db.profiles.find((x) => x.id === r.profile_id);
    process.stdout.write(`${r.created_at}  @${p?.handle ?? "?"}  ${r.reason}${r.detail ? ` — ${r.detail.replace(/\s+/g, " ").slice(0, 120)}` : ""}\n`);
  }
} else if (command === "suspend" || command === "reinstate") {
  if (!handle) usage();
  const profile = readDb().profiles.find((p) => p.handle === handle.toLowerCase());
  if (!profile) {
    process.stderr.write(`No profile @${handle}.\n`);
    process.exit(1);
  }
  void mutate((db) => applySuspension(db, profile.id, command === "suspend", null)).then((updated) => {
    process.stdout.write(`@${updated.handle} ${updated.suspended_at ? `suspended at ${updated.suspended_at}` : "reinstated"}.\n`);
  });
} else {
  usage();
}
