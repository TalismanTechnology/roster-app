"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/auth";
import { getRepository } from "@/lib/data";
import { ownedImageExists } from "@/lib/media";
import { z } from "zod";
import type { FormState } from "@/lib/actions/resume";

const identity = z.object({
  display_name: z.string().trim().min(2, "Enter your name.").max(80),
  bio: z.string().trim().max(500).transform(value => value || null),
  school: z.string().trim().max(120).transform(value => value || null),
});

export async function saveMemberIdentity(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to update your profile." };
  const parsed = identity.safeParse({ display_name: form.get("display_name"), bio: form.get("bio"), school: form.get("school") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const profile = await (await getRepository()).updateProfile(user.id, parsed.data);
    revalidatePath("/settings"); revalidatePath("/resume"); revalidatePath("/app", "layout"); revalidatePath(`/${profile.handle}`);
    return { ok: true, error: null };
  } catch { return { ok: false, error: "Could not save your profile. Try again." }; }
}

export async function saveProfilePhoto(purpose: "avatar" | "cover", path: string | null): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to update your photos." };
  if (purpose !== "avatar" && purpose !== "cover") return { error: "Choose a profile or cover photo." };
  try {
    if (path !== null && !await ownedImageExists(path, user.id)) return { error: "Upload your photo again before saving." };
    const profile = await (await getRepository()).updateProfile(user.id, { [purpose === "avatar" ? "avatar_url" : "cover_url"]: path ? `/api/media/${path}` : null });
    revalidatePath("/resume"); revalidatePath("/app", "layout"); revalidatePath(`/${profile.handle}`);
    return { error: null };
  } catch { return { error: "Your photo could not be saved. Please try again." }; }
}
