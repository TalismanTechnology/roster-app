export function safeAuthReturn(value: unknown, fallback = "/app"): string {
 return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\r\n]/.test(value) ? value : fallback;
}
export function authCallbackUrl(next = "/app"): string {
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin && process.env.NODE_ENV==='production') throw new Error('NEXT_PUBLIC_SITE_URL is required.');
 return `${origin || 'http://localhost:3000'}/auth/callback?next=${encodeURIComponent(safeAuthReturn(next))}`;
}
