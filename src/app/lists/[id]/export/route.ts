import { idSchema } from "@/lib/actions/schemas";
import { csvFilename } from "@/lib/csv";
import { getRepository } from "@/lib/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import { isRecruiterKind } from "@/lib/data/rules";
import { listMembersToCsv } from "@/lib/list-export";

/**
 * #89: a list as a CSV attachment. The same gate as the page — a session on
 * a recruiter or coach account, and the list must be theirs — and the same
 * rows: `getList` already drops athletes whose resume went private. Never
 * cached; the list changes under the recruiter's hands.
 */
export async function GET(_request: Request, { params }: RouteContext<"/lists/[id]/export">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to export a list.", { status: 401 });
  const profile = await getCurrentProfile();
  if (!profile || !isRecruiterKind(profile.account_kind)) return new Response("Not found", { status: 404 });
  if (!idSchema.safeParse(id).success) return new Response("Not found", { status: 404 });

  const detail = await (await getRepository()).getList(user.id, id);
  if (!detail) return new Response("Not found", { status: 404 });

  // A BOM so Excel reads the file as UTF-8 (names with accents).
  return new Response(`﻿${listMembersToCsv(detail.members)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(detail.list.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
