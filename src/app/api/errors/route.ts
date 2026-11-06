import { z } from "zod";

import { logger } from "@/lib/logger";
import { limit } from "@/lib/rate-limit";

/**
 * Where error.tsx / global-error.tsx report what broke in the browser
 * (lib/report-client-error.ts). Unauthenticated by necessity, so it is
 * narrow: same-origin only, a few hundred bytes, a fixed shape, and a small
 * per-address budget. Always 204 — a reporter learns nothing from the reply.
 */

const MAX_BODY_BYTES = 2_048;
const REPORTS_PER_MINUTE = 10;

const reportSchema = z.object({
  boundary: z.enum(["route", "global"]),
  digest: z.string().max(64).nullable(),
  message: z.string().max(300),
  path: z.string().max(200),
});

const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) return noContent();

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!limit({ scope: "client-error", key: client, limit: REPORTS_PER_MINUTE, windowMs: 60_000 })) return noContent();

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return noContent();
  let parsed;
  try {
    parsed = reportSchema.safeParse(JSON.parse(text));
  } catch {
    return noContent();
  }
  if (!parsed.success) return noContent();

  logger.error("client.render_error", {
    boundary: parsed.data.boundary,
    digest: parsed.data.digest,
    path: parsed.data.path,
    error: { name: "ClientError", message: parsed.data.message },
  });
  return noContent();
}
