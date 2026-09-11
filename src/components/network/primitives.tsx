import Link from "next/link";
import type { MemberSummary } from "@/lib/network/types";

export function Avatar({ member, large = false }: { member: Pick<MemberSummary, "name" | "avatar">; large?: boolean }) {
  return <span className={`network-avatar ${large ? "network-avatar-large" : ""}`}>{member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span>}</span>;
}
export function MemberIdentity({ member }: { member: MemberSummary }) {
  return <Link className="network-identity" href={`/app/people/${member.handle}`}><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.role}{member.sport ? ` · ${member.sport}` : ""}</small></span></Link>;
}
export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return <header className="network-page-heading">{eyebrow && <p className="network-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children && <div className="network-muted">{children}</div>}</header>;
}
export function EmptyState({ title, children, href, label }: { title: string; children: React.ReactNode; href?: string; label?: string }) {
  return <div className="network-empty"><span className="network-empty-mark" aria-hidden>↗</span><h2>{title}</h2><p>{children}</p>{href && <Link className="network-button" href={href}>{label}</Link>}</div>;
}
export function Timestamp({ value }: { value: string }) {
  return <time className="network-time" dateTime={value}>{new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC</time>;
}
