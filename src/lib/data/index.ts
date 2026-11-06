import "server-only";

import { dataMode, type DataMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { LocalRepository } from "./local/repository";
import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabase/repository";

export { dataMode };
export type { DataMode };

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
