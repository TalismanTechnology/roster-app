import { isMediaRequestSameOrigin } from "@/lib/media-origin";
import { getCurrentUser } from "@/lib/data/auth";
import { getRepository } from "@/lib/data";
import { DataError } from "@/lib/data/types";
import { getNetworkRepository } from "@/lib/network";
import { MAX_UPLOAD_BYTES, storeImage } from "@/lib/media";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isMediaRequestSameOrigin(request, process.env.NODE_ENV, process.env.NEXT_PUBLIC_SITE_URL)) return Response.json({ error: "Upload from the Roster app." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 65536) return Response.json({ error: "Choose a photo smaller than 10 MB." }, { status: 413 });
    const user = await getCurrentUser();
    if (!user || !user.emailConfirmed) return Response.json({ error: "Sign in with a confirmed email to upload photos." }, { status: 401 });
    if (!await (await getRepository()).getProfileById(user.id)) return Response.json({ error: "Complete your profile first." }, { status: 403 });
    const form = await request.formData();
    const purpose = form.get("purpose");
    if (purpose !== "post" && purpose !== "avatar" && purpose !== "cover") return Response.json({ error: "Choose where to use this photo." }, { status: 400 });
    const membership = await (await getNetworkRepository()).getMembership();
    if (membership?.status === "suspended" || (purpose === "post" && membership?.status !== "active")) return Response.json({ error: "An active network membership is required." }, { status: 403 });
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
    const path = await storeImage(file, purpose, user.id);
    return Response.json({ path, url: `/api/media/${path}` }, { status: 201 });
  } catch (error) {
    const status = error instanceof DataError && error.code === "invalid" ? 400 : 503;
    return Response.json({ error: error instanceof DataError ? error.message : "Photo upload is temporarily unavailable. Please try again." }, { status });
  }
}
