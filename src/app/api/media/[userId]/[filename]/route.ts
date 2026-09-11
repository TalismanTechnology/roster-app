import { getCurrentUser } from "@/lib/data/auth";
import { mayReadImage, readImage, validMediaPath } from "@/lib/media";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ userId: string; filename: string }> }) {
  const { userId, filename } = await context.params;
  const key = `${userId}/${filename}`;
  if (!validMediaPath(key)) return new Response(null, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!await mayReadImage(key, user?.id ?? null)) return new Response(null, { status: 404 });
    const bytes = await readImage(key);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Vary": "Cookie" } });
  } catch {
    return new Response(null, { status: 503 });
  }
}
