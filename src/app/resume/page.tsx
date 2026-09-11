import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildChecklist, Checklist, firstUnfinished, type SectionId } from "@/components/editor/Checklist";
import { AcademicsSection, ContactSection, IdentitySection, VisibilitySection } from "@/components/editor/ProfileSections";
import { CoachSection, FilmSection, RecordSection } from "@/components/editor/RecordSections";
import { RequestsSection } from "@/components/editor/RequestsSection";
import { ResumeDocument } from "@/components/record/ResumeDocument";
import { ShareBar } from "@/components/record/ShareBar";
import { Site } from "@/components/shell/Site";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import "@/components/editor/workspace.css";
export const metadata: Metadata = { title: "Your athlete workspace", robots: { index: false, follow: false } };
const SECTIONS: { id: SectionId; label: string }[] = [{id:"identity",label:"Identity"},{id:"record",label:"Record"},{id:"film",label:"Film"},{id:"academics",label:"Academics"},{id:"references",label:"References"},{id:"contact",label:"Contact"},{id:"visibility",label:"Visibility"},{id:"requests",label:"Requests"}];
export default async function ResumeEditorPage({ searchParams }: { searchParams: Promise<{ section?: string; view?: string }> }) {
 const user = await getCurrentUser(); if (!user) redirect("/sign-in?next=/resume");
 const repo = await getRepository(); const profile = await repo.getProfileById(user.id); if (!profile) redirect("/onboarding");
 if (profile.account_kind !== "athlete") redirect(profile.account_kind === "coach" ? "/app/coaching" : "/lists");
 const [entries,film,coaches,publicCoaches,requests,weekViews,params] = await Promise.all([repo.listEntries(user.id),repo.listFilm(user.id),repo.listCoaches(user.id,user.id),repo.listCoaches(user.id,null),repo.listVerificationRequests(user.id),repo.weeklyViews(user.id),searchParams]);
 const checklist = buildChecklist(profile,entries,film,coaches);
 const active = SECTIONS.some(section => section.id === params.section) ? params.section as SectionId : firstUnfinished(checklist);
 const preview = params.view === "preview";
 const pending = requests.filter(request => request.status === "pending" && new Date(request.expires_at).getTime() > Date.now()).length;
 return <Site><main className="resume-workspace"><header className="workspace-heading"><div><p className="text-xs font-bold uppercase tracking-widest text-ink-muted">ATHLETE WORKSPACE</p><h1>Your story, on the record.</h1><p className="text-sm text-ink-muted">Make every result, milestone, and season count.</p></div><div className="workspace-publication"><span className="workspace-status">{profile.visibility} résumé</span><p className="text-xs text-ink-muted">{weekViews} views this week · {entries.length} {entries.length === 1 ? "entry" : "entries"}</p>{profile.visibility !== "private" ? <ShareBar handle={profile.handle} print={false} /> : <Link href="/resume?section=visibility" className="btn-outline min-h-11 text-sm">Manage visibility</Link>}</div></header>
 {!preview && <Checklist items={checklist} />}
 <nav className="workspace-view-tabs" aria-label="Workspace view"><Link href={`/resume?section=${active}`} aria-current={!preview ? "page" : undefined}>Edit</Link><Link href={`/resume?section=${active}&view=preview`} aria-current={preview ? "page" : undefined}>Preview</Link></nav>
 <div className={`workspace-editor-grid ${preview ? "is-preview" : ""}`}><nav className="workspace-sections" aria-label="Resume sections">{SECTIONS.map(section => <Link key={section.id} href={`/resume?section=${section.id}`} aria-current={section.id===active ? "page" : undefined}>{section.label}{section.id==="requests" && pending>0 && <span>{pending}</span>}</Link>)}</nav>
 <div className="workspace-active-section" key={active}>{active==="identity" && <IdentitySection profile={profile} />}{active==="record" && <RecordSection entries={entries} coaches={coaches} requests={requests} />}{active==="film" && <FilmSection clips={film} />}{active==="academics" && <AcademicsSection profile={profile} />}{active==="references" && <CoachSection coaches={coaches} />}{active==="contact" && <ContactSection profile={profile} />}{active==="visibility" && <VisibilitySection profile={profile} />}{active==="requests" && <RequestsSection requests={requests} entries={entries} coaches={coaches} />}</div>
 <aside className="workspace-preview" aria-label="Resume preview"><div className="workspace-preview-header"><h2>Saved résumé preview</h2><p>Updates after you save. {profile.visibility==="private" ? "Only you can open your private résumé." : "Contact details follow your visibility settings."}</p><Link href={`/${profile.handle}`} className="btn-ghost min-h-11 text-sm">Open full preview ↗</Link></div><div className="workspace-preview-document"><ResumeDocument profile={profile} entries={entries} film={film} coaches={publicCoaches} /></div></aside></div></main></Site>;
}
