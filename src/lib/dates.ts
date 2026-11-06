/**
 * "Today" for validating dates an athlete types.
 *
 * The server runs in UTC but athletes don't, and an entry dated today in
 * Auckland is already tomorrow in UTC. So the ceiling is the latest
 * calendar date anywhere on Earth (UTC+14): nothing a real person enters
 * as "today" is refused, and nothing more than a day ahead gets through.
 */
const LATEST_OFFSET_MS = 14 * 3_600_000;

/** YYYY-MM-DD, the latest date that is "today" somewhere. */
export function latestToday(now: Date = new Date()): string {
  return new Date(now.getTime() + LATEST_OFFSET_MS).toISOString().slice(0, 10);
}
