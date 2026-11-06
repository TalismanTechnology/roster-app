import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Every surface an athlete's profile shows up on, refreshed together. The
 * editor, the public resume, and search all render from the same rows, so a
 * save that refreshed only one of them would leave the others stale until
 * the next unrelated write. Server Functions and Route Handlers only.
 */
export function revalidateProfile(handle: string | null | undefined): void {
  revalidatePath("/resume");
  if (handle) revalidatePath(`/${handle}`);
  revalidatePath("/search");
}
