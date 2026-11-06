import { isLocalMode } from "@/lib/data";
import { readAvatar } from "@/lib/data/local/avatars";

/**
 * Local-mode avatars, served from the data directory. Supabase mode serves
 * them from Storage and this route does not exist for it.
 *
 * File names are versioned per upload (see lib/avatars.ts), so a response
 * never changes and may be cached for good.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/avatars/[file]">) {
  if (!isLocalMode()) return new Response("Not found", { status: 404 });
  const { file } = await params;
  const avatar = readAvatar(file);
  if (!avatar) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
