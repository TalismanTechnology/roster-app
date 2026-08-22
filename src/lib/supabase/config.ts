/**
 * Whether real Supabase credentials are present.
 *
 * A fresh clone has `.env.example` values, which point at a hostname that does
 * not resolve. Without this check the proxy's auth call hangs on DNS for every
 * request and the whole app appears broken, which is a miserable first ten
 * minutes for anyone new to the repo. Instead we detect the placeholder and
 * degrade to a signed-out, un-gated app so `/preview` still renders.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
      key &&
      !url.includes("your-project") &&
      key !== "your-anon-key" &&
      url.startsWith("https://"),
  );
}
