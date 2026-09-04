import { readDb, resetDb } from "../src/lib/data/local/store";

/**
 * Rebuilds the local database from seed-data.ts. Destructive on purpose:
 * `npm run seed` is "give me a clean roster", not a migration.
 */
resetDb();
const db = readDb();
process.stdout.write(
  `Seeded .data/roster.json — ${db.profiles.length} profiles, ${db.achievements.length} entries, ${db.film_clips.length} clips.\n` +
    `Sign in as any athlete with <handle>@roster.local / roster-demo, or coach@roster.local / recruiter@roster.local.\n`,
);
