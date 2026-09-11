import type { Report } from "@/lib/network/types";

export function ReportEvidence({ report }: { report: Report }) {
  const evidence = report.evidence && typeof report.evidence === "object" ? report.evidence as Record<string, unknown> : {};
  const text = typeof evidence.text === "string" ? evidence.text : typeof evidence.name === "string" ? evidence.name : null;
  const images = Array.isArray(evidence.images) ? evidence.images.filter((value): value is string => typeof value === "string") : [];
  return <div className="rounded-lg border border-rule p-4 my-3">
    <p className="network-eyebrow">Reported {report.targetType} · preserved evidence</p>
    {text ? <p className="my-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p> : <p className="my-3 text-sm text-ink-muted">No text was attached to this report.</p>}
    {typeof evidence.filmUrl === "string" && /^https:\/\//.test(evidence.filmUrl) && <a className="network-button-quiet" href={evidence.filmUrl} target="_blank" rel="noopener noreferrer">Open reported film ↗</a>}
    {images.length > 0 && <div className="grid grid-cols-2 gap-2">{images.map((path, index) => <img key={path} alt={`Reported photo ${index + 1}`} src={`/api/moderation/${report.id}/${encodeURIComponent(path.split("/").at(-1) ?? "")}`} className="w-full rounded-md" />)}</div>}
    <p className="network-help">Restricted to staff. Retained until 90 days after resolution.</p>
  </div>;
}
