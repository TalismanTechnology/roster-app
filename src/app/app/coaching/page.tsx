import Link from "next/link";
import { redirect } from "next/navigation";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import type { VerificationRequest } from "@/lib/data/types";
import { EmptyState, PageHeading, Timestamp } from "@/components/network/primitives";

type InboxFilter = "pending" | "completed" | "disputed" | "expired";
const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "disputed", label: "Disputed" },
  { id: "expired", label: "Expired" },
];
function statusOf(request: VerificationRequest, now: number): InboxFilter {
  if (request.status === "expired" || (request.status === "pending" && Date.parse(request.expires_at) <= now)) return "expired";
  return request.status === "verified" ? "completed" : request.status;
}

export default async function CoachingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/app/coaching");
  const repo = await getRepository();
  const profile = await repo.getProfileById(user.id);
  if (profile?.account_kind !== "coach") return <div className="network-page"><PageHeading eyebrow="COACH WORKSPACE" title="Stand behind the work.">Verification requests are available to coach accounts.</PageHeading><Link href="/app" className="network-button-quiet">Back to your workspace</Link></div>;
  if (!user.emailConfirmed) return <div className="network-page"><PageHeading eyebrow="COACH WORKSPACE" title="Confirm your email to review.">Requests are matched to the exact confirmed email invited by the athlete.</PageHeading><Link href="/settings" className="network-button">Account settings</Link></div>;

  const { status } = await searchParams;
  const active: InboxFilter = FILTERS.some(filter => filter.id === status) ? status as InboxFilter : "pending";
  // This owner-scoped list supplies the only IDs we resolve into request details.
  const requests = await repo.listCoachVerificationRequests(user.id);
  const now = Date.now();
  const selected = requests.filter(request => statusOf(request, now) === active);
  const details = await Promise.all(selected.map(async request => ({ request, detail: await repo.getVerificationRequest(request.id) })));

  return <div className="network-page">
    <PageHeading eyebrow="COACH WORKSPACE / VERIFICATION" title="Recognize the work.">Review the achievements you can personally confirm. Your response helps an athlete build a credible record.</PageHeading>
    <div className="network-workspace-strip"><p className="network-help">Requests below were addressed to your confirmed email. Creating a request link does not send an email.</p><Link className="network-button-quiet" href="/lists">Recruiting lists ↗</Link></div>
    <nav className="network-tabs overflow-x-auto" aria-label="Verification request status">{FILTERS.map(filter => <Link key={filter.id} className={`whitespace-nowrap ${active === filter.id ? "active" : ""}`} aria-current={active === filter.id ? "page" : undefined} href={`/app/coaching?status=${filter.id}`}>{filter.label} <span className="ml-1 text-xs">{requests.filter(request => statusOf(request, now) === filter.id).length}</span></Link>)}</nav>
    {details.length === 0 ? <EmptyState title={active === "pending" ? "No requests waiting." : `No ${active} requests.`}>{active === "pending" ? "When an athlete invites you to verify an achievement using your account email, the request appears here." : "Requests in this category will appear here with their review history."}</EmptyState> : <ul className="network-feed mt-6">{details.map(({ request, detail }) => <li key={request.id} className="network-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="network-eyebrow">{active === "completed" ? "Verified" : active === "pending" ? "Awaiting your review" : active === "disputed" ? "Needs athlete attention" : "Expired"}</p><Timestamp value={request.created_at} /></div>
      {detail ? <><h2 className="mt-4 text-lg font-semibold">{detail.entry.title}</h2><p className="mt-2 text-sm text-ink-muted">{detail.athlete.display_name}{detail.entry.value_display ? ` · ${detail.entry.value_display}` : ""}</p><p className="mt-2 text-xs text-ink-muted">Achievement date: {detail.entry.achieved_on}</p></> : <><h2 className="mt-4 text-lg font-semibold">Achievement no longer available</h2><p className="network-help mt-2">The athlete may have removed the achievement or its reference. This request remains in your history.</p></>}
      {request.note && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-relaxed">{request.note}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="network-help">{active === "pending" ? `Review by ${new Date(request.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : active === "expired" ? "A new request is needed before you can respond." : request.responded_at ? <>Responded <Timestamp value={request.responded_at} /></> : "Response recorded."}</p>{detail && <Link className={active === "pending" ? "network-button" : "network-button-quiet"} href={`/verify/${request.id}`}>{active === "pending" ? "Review achievement" : "View request"} ↗</Link>}</div>
    </li>)}</ul>}
  </div>;
}
