"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { idSchema } from "./schemas";
import { failed, formValues, requireRecruiter, str } from "./shared";

/**
 * Recruiter lists. Owner-only at the repository; here we require a session
 * on a recruiter or coach account (#86) and pass the user through. Forms
 * post from search rows and the list pages, so each action revalidates both.
 */

export type ListFormState = {
  ok: boolean;
  error: string | null;
  values?: Record<string, string>;
  /** On a validation failure, each field's messages. */
  fieldErrors?: Record<string, string[]>;
};

const IDLE: ListFormState = { ok: true, error: null };

const requireUser = () => requireRecruiter("/sign-in?next=/lists");

function refresh() {
  revalidatePath("/lists");
  revalidatePath("/search");
}

const nameSchema = z.string().trim().min(2, "Give the list a name.").max(60);
const noteSchema = z
  .string()
  .trim()
  .max(300, "Keep the note under 300 characters.")
  .transform((v) => (v === "" ? null : v));

export async function createList(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const { repo, user } = await requireUser();
  const name = nameSchema.safeParse(str(formData, "name"));
  const note = noteSchema.safeParse(str(formData, "note"));
  const values = formValues(formData);
  if (!name.success || !note.success) {
    const fieldErrors: Record<string, string[]> = {};
    if (!name.success) fieldErrors.name = name.error.issues.map((i) => i.message);
    if (!note.success) fieldErrors.note = note.error.issues.map((i) => i.message);
    const error = Object.values(fieldErrors)[0][0];
    return { ok: false, error, values, fieldErrors };
  }

  try {
    await repo.createList(user.id, name.data, note.data);
  } catch (error) {
    return failed(error, "Could not create the list.", values);
  }

  refresh();
  return IDLE;
}

export async function renameList(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const { repo, user } = await requireUser();
  const id = idSchema.safeParse(str(formData, "list_id"));
  const name = nameSchema.safeParse(str(formData, "name"));
  const values = formValues(formData);
  if (!id.success) return { ok: false, error: "That list was not found." };
  if (!name.success) {
    const fieldErrors = { name: name.error.issues.map((i) => i.message) };
    return { ok: false, error: fieldErrors.name[0], values, fieldErrors };
  }

  try {
    await repo.renameList(user.id, id.data, name.data);
  } catch (error) {
    return failed(error, "Could not rename the list.", values);
  }

  refresh();
  revalidatePath(`/lists/${id.data}`);
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

/** #86: the recruiter's private note on one athlete in one list. Empty clears it. */
export async function updateListNote(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const { repo, user } = await requireUser();
  const listId = idSchema.safeParse(str(formData, "list_id"));
  const profileId = idSchema.safeParse(str(formData, "profile_id"));
  const note = noteSchema.safeParse(str(formData, "note"));
  const values = formValues(formData);
  if (!listId.success || !profileId.success) return { ok: false, error: "That athlete is not on this list." };
  if (!note.success) {
    const fieldErrors = { note: note.error.issues.map((i) => i.message) };
    return { ok: false, error: fieldErrors.note[0], values, fieldErrors };
  }

  try {
    await repo.setListNote(user.id, listId.data, profileId.data, note.data);
  } catch (error) {
    return failed(error, "Could not save the note.", values);
  }

  revalidatePath(`/lists/${listId.data}`);
  return { ok: true, error: null };
}

/** #89: move an athlete, note and all, to another of the recruiter's lists. */
export async function moveToList(formData: FormData): Promise<void> {
  const { repo, user } = await requireUser();
  const from = idSchema.safeParse(str(formData, "list_id"));
  const to = idSchema.safeParse(str(formData, "to_list_id"));
  const profileId = idSchema.safeParse(str(formData, "profile_id"));
  if (!from.success || !to.success || !profileId.success) return;

  try {
    await repo.moveListMember(user.id, from.data, to.data, profileId.data);
  } catch {
    // A list deleted or the athlete moved meanwhile; the page shows the truth.
  }

  refresh();
  revalidatePath(`/lists/${from.data}`);
  revalidatePath(`/lists/${to.data}`);
}
