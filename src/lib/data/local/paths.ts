import path from "node:path";

/**
 * Where local-mode state lives. Overridable so tests get a throwaway
 * directory and never touch the developer's own `.data/`.
 */
export function dataDir(): string {
  return process.env.ROSTER_DATA_DIR ?? path.join(process.cwd(), ".data");
}
