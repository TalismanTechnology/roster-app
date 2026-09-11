"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { DataError } from "@/lib/data/types";

/**
 * Recruiter lists. Owner-only at the repository; here we only require a
 * session and pass the user through. Forms post from search rows and the
 * list pages, so each action revalidates both.
 */

export type ListFormState = { ok: boolean; error: string | null };

const IDLE: ListFormState = { ok: true, error: null };

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/lists");
  return { repo: await getRepository(), user };
}

function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failed(error: unknown, fallback: string): ListFormState {
  if (error instanceof DataError) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

function refresh() {
  revalidatePath("/lists");
  revalidatePath("/search");
}

const nameSchema = z.string().trim().min(2, "Give the list a name.").max(60);
const noteSchema = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v === "" ? null : v));

export async function createList(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const { repo, user } = await requireUser();
  const name = nameSchema.safeParse(str(formData, "name"));
  const note = noteSchema.safeParse(str(formData, "note"));
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  if (!note.success) return { ok: false, error: note.error.issues[0].message };

  try {
    await repo.createList(user.id, name.data, note.data);
  } catch (error) {
    return failed(error, "Could not create the list.");
  }

  refresh();
  return IDLE;
}

export async function deleteList(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = str(formData, "list_id");
  if (!id) return;

  try {
    await repo.deleteList(user.id, id);
  } catch {
    // Already gone; nothing to do.
  }

  refresh();
  redirect("/lists");
}

/**
 * Save an athlete to a list from a search row or a resume. `new_list` lets
 * a recruiter with no lists yet create one in the same gesture.
 */
export async function addToList(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const { repo, user } = await requireUser();
  const profileId = str(formData, "profile_id");
  let listId = str(formData, "list_id");
  const newName = str(formData, "new_list").trim();

  if (!profileId) return { ok: false, error: "That athlete was not found." };

  try {
    if (listId === "__new__" || (!listId && newName)) {
      const parsed = nameSchema.safeParse(newName);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
      listId = (await repo.createList(user.id, parsed.data, null)).id;
    }
    if (!listId) return { ok: false, error: "Pick a list." };
    await repo.addToList(user.id, listId, profileId, null);
  } catch (error) {
    return failed(error, "Could not save to the list.");
  }

  refresh();
  return IDLE;
}

export async function removeFromList(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const listId = str(formData, "list_id");
  const profileId = str(formData, "profile_id");
  if (!listId || !profileId) return;

  try {
    await repo.removeFromList(user.id, listId, profileId);
  } catch {
    // Already gone; nothing to do.
  }

  refresh();
}
