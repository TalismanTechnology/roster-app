import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isLocalMode } from "@/lib/data";
import { dataDir } from "@/lib/data/local/paths";
import { DataError } from "@/lib/data/types";
import { getNetworkRepository } from "./index";

/** Restricted report artwork: callers must be active staff, never public URLs. */
export async function readReportImage(
  reportId: string,
  filename: string,
): Promise<Uint8Array> {
  const report = (await (await getNetworkRepository()).getReports()).find(
    (report) => report.id === reportId,
  );
  if (
    !report ||
    report.targetType !== "post" ||
    !report.evidence ||
    typeof report.evidence !== "object"
  )
    throw new DataError("not_found", "Report media unavailable.");
  const evidence = report.evidence as { images?: unknown };
  const mediaPath = Array.isArray(evidence.images)
    ? evidence.images.find(
        (value: unknown): value is string =>
          typeof value === "string" && path.basename(value) === filename,
      )
    : undefined;
  if (!mediaPath || path.basename(filename) !== filename)
    throw new DataError("not_found", "Report media unavailable.");
  if (isLocalMode())
    return new Uint8Array(
      await fs.readFile(
        path.join(dataDir(), "network-evidence", reportId, filename),
      ),
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new DataError(
      "unavailable",
      "Report media administration is not configured.",
    );
  const { data, error } = await createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
    .storage.from("roster-media")
    .download(mediaPath);
  if (error || !data)
    throw new DataError("unavailable", "Report media could not be read.");
  return new Uint8Array(await data.arrayBuffer());
}
