import "server-only";

import fs from "node:fs";
import path from "node:path";

import { dataDir } from "@/lib/data/local/paths";

/**
 * Where mail goes when there is no provider key: a JSON file next to the
 * local database. Local mode and the e2e run send nothing over the network,
 * yet every message is still there to read — open the file, or let a test
 * call `readOutbox()`.
 */

export type OutboxMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** What triggered it — "verification_request", "verification_answered". */
  tag: string;
  created_at: string;
};

/** Oldest messages drop off past this; the file is a log, not an archive. */
const MAX_MESSAGES = 200;

export function outboxFile(): string {
  return path.join(dataDir(), "email-outbox.json");
}

export function readOutbox(): OutboxMessage[] {
  try {
    return JSON.parse(fs.readFileSync(outboxFile(), "utf8")) as OutboxMessage[];
  } catch {
    return [];
  }
}

/**
 * Serializes appends across this process the way the store lock does —
 * on globalThis, so Next's duplicate module instances share it.
 */
const LOCK = Symbol.for("roster.email.outbox.lock");
type LockHolder = { [LOCK]?: Promise<unknown> };

export function appendOutbox(message: OutboxMessage): Promise<void> {
  const holder = globalThis as LockHolder;
  const run = (holder[LOCK] ?? Promise.resolve()).then(() => {
    const file = outboxFile();
    const messages = [...readOutbox(), message].slice(-MAX_MESSAGES);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(messages, null, 2));
    fs.renameSync(tmp, file);
  });
  holder[LOCK] = run.catch(() => undefined);
  return run;
}
