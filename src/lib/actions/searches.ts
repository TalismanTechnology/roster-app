"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { emailDigestOptIn } from "@/lib/email/digest";
import { canonicalQuery } from "@/lib/search-filters";
import { absoluteUrl } from "@/lib/site";

import { idSchema } from "./schemas";
import { failed, formValues, requireRecruiter, str } from "./shared";

/**
 * Saved searches (#88). Recruiter and coach accounts only, owner-only at
 * the repository. The query is re-canonicalized here, so whatever a form
 * posts, only a string the search page itself would produce is stored.
 */

export type SavedSearchState = {
  ok: boolean;
  error: string | null;
  values?: Record<string, string>;
  fieldErrors?: Record<string, string[]>;
};

const requireUser = () => requireRecruiter("/sign-in?next=/search");

const nameSchema = z.string().trim().min(2, "Name the search.").max(60, "Keep the name under 60 characters.");

export async function saveSearch(_prev: SavedSearchState, formData: FormData): Promise<SavedSearchState> {
  const { repo, user } = await requireUser();
  const name = nameSchema.safeParse(str(formData, "name"));
  const values = formValues(formData);
  if (!name.success) {
    const fieldErrors = { name: name.error.issues.map((i) => i.message) };
    return { ok: false, error: fieldErrors.name[0], values, fieldErrors };
  }
  const query = canonicalQuery(str(formData, "query"));
  const digest = str(formData, "digest") === "on";

  try {
    await repo.saveSearch(user.id, name.data, query, digest);
  } catch (error) {
    return failed(error, "Could not save the search.", values);
  }
  if (digest) await emailDigestOptIn({ to: user.email, searchName: name.data, url: searchUrl(query) });

  revalidatePath("/search");
  return { ok: true, error: null };
}

export async function toggleSavedSearchDigest(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;
  const turnOn = str(formData, "digest") === "on";

  try {
    await repo.setSavedSearchDigest(user.id, id.data, turnOn);
    if (turnOn) {
      const saved = (await repo.listSavedSearches(user.id)).find((s) => s.id === id.data);
      if (saved) await emailDigestOptIn({ to: user.email, searchName: saved.name, url: searchUrl(saved.query) });
    }
  } catch {
    // Deleted meanwhile; the refreshed page shows the truth.
  }
  revalidatePath("/search");
}

export async function deleteSavedSearch(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "id"));
  if (!id.success) return;

  try {
    await repo.deleteSavedSearch(user.id, id.data);
  } catch {
    // Already gone.
  }
  revalidatePath("/search");
}

function searchUrl(query: string): string {
  return absoluteUrl(query ? `/search?${query}` : "/search");
}
