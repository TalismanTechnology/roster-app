import { readReportImage } from "@/lib/network/evidence";
import { DataError } from "@/lib/data/types";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ reportId: string; filename: string }> }) {
  const { reportId, filename } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(reportId) || !/^[a-f0-9-]{36}\.webp$/.test(filename)) return new Response(null, { status: 404 });
  try {
    const bytes = await readReportImage(reportId, filename);
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
  } catch (error) { return new Response(null, { status: error instanceof DataError && error.code === "unavailable" ? 503 : 404 }); }
}
