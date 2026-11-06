"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { idSchema } from "./schemas";
import { failed, formValues, requireUser as requireSession, str } from "./shared";

/**
 * Recruiter lists. Owner-only at the repository; here we only require a
 * session and pass the user through. Forms post from search rows and the
 * list pages, so each action revalidates both.
 */

export type ListFormState = { ok: boolean; error: string | null; values?: Record<string, string> };

const IDLE: ListFormState = { ok: true, error: null };

const requireUser = () => requireSession("/sign-in?next=/lists");

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
  const values = formValues(formData);
  if (!name.success) return { ok: false, error: name.error.issues[0].message, values };
  if (!note.success) return { ok: false, error: note.error.issues[0].message, values };

  try {
    await repo.createList(user.id, name.data, note.data);
  } catch (error) {
    return failed(error, "Could not create the list.", values);
  }

  refresh();
  return IDLE;
}

export async function deleteList(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "list_id"));
  if (!id.success) return;

  try {
    await repo.deleteList(user.id, id.data);
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
  const profileId = idSchema.safeParse(str(formData, "profile_id"));
  let listId = str(formData, "list_id");
  const newName = str(formData, "new_list").trim();

  if (!profileId.success) return { ok: false, error: "That athlete was not found." };

  try {
    if (listId === "__new__" || (!listId && newName)) {
      const parsed = nameSchema.safeParse(newName);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
      listId = (await repo.createList(user.id, parsed.data, null)).id;
    }
    if (!listId) return { ok: false, error: "Pick a list." };
    if (!idSchema.safeParse(listId).success) return { ok: false, error: "That list was not found." };
    await repo.addToList(user.id, listId, profileId.data, null);
  } catch (error) {
    return failed(error, "Could not save to the list.");
  }

  refresh();
  return IDLE;
}

export async function removeFromList(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const listId = idSchema.safeParse(str(formData, "list_id"));
  const profileId = idSchema.safeParse(str(formData, "profile_id"));
  if (!listId.success || !profileId.success) return;

  try {
    await repo.removeFromList(user.id, listId.data, profileId.data);
  } catch {
    // Already gone; nothing to do.
  }

  refresh();
}
