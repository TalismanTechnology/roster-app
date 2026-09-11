import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import { LocalRepository } from "./local/repository";
import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabase/repository";

export type DataMode = "local" | "supabase";

/**
 * Which adapter serves this process. `ROSTER_DATA` forces one; otherwise
 * Supabase when real credentials are present, the local file when not.
 */
export function dataMode(): DataMode {
  const forced = process.env.ROSTER_DATA;
  if (forced === "local" && process.env.NODE_ENV === "production") throw new Error("Local data mode is disabled in production.");
  if (process.env.NODE_ENV === "production" && !isSupabaseConfigured()) throw new Error("Supabase configuration is required in production.");
  if (forced === "local" || forced === "supabase") return forced;
  return isSupabaseConfigured() ? "supabase" : "local";
}

export function isLocalMode(): boolean {
  return dataMode() === "local";
}

/** The data layer for this request. Pages and actions call nothing else. */
export async function getRepository(): Promise<Repository> {
  if (dataMode() === "supabase") {
    return new SupabaseRepository(await createClient());
  }
  return new LocalRepository();
}

export type { Repository } from "./repository";
export * from "./types";
