/**
 * The two verification emails, as plain data: subject, text, and HTML.
 * Pure functions — no I/O — so tests can assert on exactly what a coach or
 * an athlete would read.
 *
 * The HTML follows the site: near-black paper, hairline rules, a monospace
 * label above the headline. Everything interpolated is escaped; names and
 * titles are typed by athletes.
 */

export type RenderedEmail = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header-safe: a subject line never carries a newline someone typed. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function layout(label: string, headline: string, body: string, cta?: { href: string; text: string }): string {
  const button = cta
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#f4f4f2;color:#0b0b0c;padding:12px 18px;font-weight:700;text-decoration:none;border-radius:2px">${escapeHtml(cta.text)}</a></p>
<p style="margin:16px 0 0;font:12px/1.5 ui-monospace,Menlo,monospace;color:#8a8a86;word-break:break-all">${escapeHtml(cta.href)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;color:#f4f4f2;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-top:1px solid #2a2a28">
<tr><td style="padding-top:20px">
<p style="margin:0;font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#8a8a86">[ ${escapeHtml(label)} ]</p>
<h1 style="margin:16px 0 0;font-size:26px;line-height:1.15;letter-spacing:-.01em">${escapeHtml(headline)}</h1>
${body}
${button}
<p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #2a2a28;font:11px/1.6 ui-monospace,Menlo,monospace;color:#6b6b67">ROSTER · Verified athletic resumes</p>
</td></tr></table></td></tr></table></body></html>`;
}

const para = (text: string, muted = false) =>
  `<p style="margin:14px 0 0;color:${muted ? "#a6a6a1" : "#f4f4f2"}">${escapeHtml(text)}</p>`;

export function verificationRequestEmail(input: {
  coachName: string;
  athleteName: string;
  entryTitle: string;
  url: string;
  expiresAt: string;
}): RenderedEmail {
  const { coachName, athleteName, entryTitle, url } = input;
  const expires = new Date(input.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const subject = oneLine(`${athleteName} asked you to verify “${entryTitle}”`);
  const lines = [
    `Hi ${coachName},`,
    `${athleteName} listed you as the coach who saw this on their Roster resume: “${entryTitle}”.`,
    "If it's right, confirm it and the entry carries your name. If it isn't, say so — or tell us you don't know this athlete. No account needed.",
  ];
  const text = [...lines, "", url, "", `The link works once and expires ${expires}. If you weren't expecting this, you can ignore it.`].join("\n");
  const html = layout(
    "Verification request",
    `${athleteName} says this happened.`,
    lines.map((l, i) => para(l, i === 2)).join("\n") + para(`Works once · expires ${expires}`, true),
    { href: url, text: "Review the entry" },
  );
  return { subject, text, html };
}

export function verificationAnsweredEmail(input: {
  athleteName: string;
  coachName: string;
  entryTitle: string;
  outcome: "verified" | "disputed";
  flaggedUnknownAthlete: boolean;
  note: string | null;
  editorUrl: string;
}): RenderedEmail {
  const { athleteName, coachName, entryTitle, outcome, flaggedUnknownAthlete, note, editorUrl } = input;
  const verdict =
    outcome === "verified"
      ? `${coachName} verified “${entryTitle}”.`
      : flaggedUnknownAthlete
        ? `${coachName} said they don't know you, so “${entryTitle}” was not verified.`
        : `${coachName} disputed “${entryTitle}”.`;
  const next =
    outcome === "verified"
      ? "The entry now carries their name on your resume."
      : flaggedUnknownAthlete
        ? "Check you sent it to the right coach, then request again from your editor."
        : "Fix the entry in your editor and request verification again.";
  const subject = oneLine(outcome === "verified" ? `Verified: ${entryTitle}` : `Needs a fix: ${entryTitle}`);
  const text = [`Hi ${athleteName},`, verdict, note ? `Their note: “${note}”` : null, next, "", editorUrl]
    .filter((l) => l !== null)
    .join("\n");
  const html = layout(
    outcome === "verified" ? "Verified" : "Disputed",
    verdict,
    [para(`Hi ${athleteName},`, true), note ? para(`“${note}”`) : "", para(next, true)].join("\n"),
    { href: editorUrl, text: outcome === "verified" ? "See your resume" : "Fix & request again" },
  );
  return { subject, text, html };
}
