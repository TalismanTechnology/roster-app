import "server-only";
import { createClient } from "@supabase/supabase-js";
import { removeOwnedStorage } from "@/lib/data/account-cleanup";
import { DataError } from "@/lib/data/types";

export async function deleteAuthAccount(userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new DataError(
      "unavailable",
      "Account administration is not configured.",
    );
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: retained, error: retentionError } = await admin.rpc(
    "prepare_network_media_cleanup",
    { user_id: userId },
  );
  if (
    retentionError ||
    !Array.isArray(retained) ||
    !retained.every((path) => typeof path === "string")
  )
    throw new DataError(
      "unavailable",
      "Could not preserve report evidence. Account deletion was stopped.",
    );
  await removeOwnedStorage(
    admin.storage.from("roster-media"),
    userId,
    retained as string[],
  );
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error)
    throw new DataError(
      "unavailable",
      "Could not delete the account. Please try again.",
    );
}
