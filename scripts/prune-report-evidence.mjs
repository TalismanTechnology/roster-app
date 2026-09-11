/** Run hourly with Node22: node --import tsx scripts/prune-report-evidence.mjs */
import { createClient } from "@supabase/supabase-js";
const local =
  process.env.ROSTER_DATA === "local" ||
  (process.env.ROSTER_DATA !== "supabase" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL);
if (local) {
  const { pruneLocalReportEvidence } =
    await import("../src/lib/network/local.ts");
  await pruneLocalReportEvidence();
  console.log("Local expired report evidence removed.");
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Supabase URL and service-role key are required for evidence maintenance.",
    );
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: paths, error } = await admin.rpc(
    "expired_network_evidence_media",
  );
  if (
    error ||
    !Array.isArray(paths) ||
    !paths.every(
      (path) =>
        typeof path === "string" &&
        /^[a-f0-9-]{36}\/[a-f0-9-]+\.webp$/.test(path),
    )
  )
    throw new Error("Could not load expired retained media paths.");
  for (let index = 0; index < paths.length; index += 100) {
    const { error: removeError } = await admin.storage
      .from("roster-media")
      .remove(paths.slice(index, index + 100));
    if (removeError)
      throw new Error(
        "Could not delete expired evidence media; report metadata was preserved for retry.",
      );
  }
  const { error: pruneError } = await admin.rpc(
    "prune_network_report_evidence",
  );
  if (pruneError) throw new Error("Could not prune expired report metadata.");
  console.log(
    `Expired report evidence removed (${paths.length} retained images).`,
  );
}
