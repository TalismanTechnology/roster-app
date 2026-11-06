import "server-only";

import { dataMode, type DataMode } from "@/lib/env";
import { createAnonClient } from "@/lib/supabase/anon";
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

/**
 * The data layer as an anonymous visitor sees it, with no cookies read. For
 * public, cacheable surfaces (sitemap, share cards, the proxy) — never for
 * anything that acts for, or depends on, the signed-in user.
 */
export function getPublicRepository(): Repository {
  if (dataMode() === "supabase") return new SupabaseRepository(createAnonClient());
  return new LocalRepository();
}

export type { Repository } from "./repository";
export * from "./types";
