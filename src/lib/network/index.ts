import { getCurrentUser } from "@/lib/data/auth";
import { isLocalMode } from "@/lib/data";
import { LocalNetworkRepository } from "./local";
import { SupabaseNetworkRepository } from "./supabase";
import type { NetworkRepository } from "./repository";
export async function getNetworkRepository(): Promise<NetworkRepository> {
  return isLocalMode()
    ? new LocalNetworkRepository(await getCurrentUser())
    : SupabaseNetworkRepository.create();
}
export * from "./types";
export type { NetworkRepository } from "./repository";
