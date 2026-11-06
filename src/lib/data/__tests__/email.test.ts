import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";

import { outboxFile, readOutbox } from "@/lib/email/outbox";
import { DEFAULT_EMAIL_FROM, sendEmail } from "@/lib/email/send";
import { escapeHtml, verificationAnsweredEmail, verificationRequestEmail } from "@/lib/email/templates";
import { emailAthleteAnswer, emailCoachRequest } from "@/lib/email/verification";

/**
 * Email without a network: the templates as pure data, the outbox when no
 * key is set, and the exact request Resend would get when one is — with
 * `fetch` stubbed, so nothing leaves the machine.
 */

let dir: string;
const realFetch = globalThis.fetch;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-email-"));
  process.env.ROSTER_DATA_DIR = dir;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  process.env.NEXT_PUBLIC_SITE_URL = "https://roster.test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("templates", () => {
  it("escapes what athletes typed and keeps subjects on one line", () => {
    const email = verificationRequestEmail({
      coachName: "Tom <b>",
      athleteName: "Eve\nBcc: x@evil.test",
      entryTitle: `"400m" & <script>`,
      url: "https://roster.test/verify/abc",
      expiresAt: "2026-12-05T00:00:00Z",
    });
    assert.equal(email.subject.includes("\n"), false);
    assert.equal(email.html.includes("<script>"), false);
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(email.text.includes("https://roster.test/verify/abc"));
    assert.ok(email.text.includes("December 5, 2026"));
    assert.equal(escapeHtml(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;");
  });

  it("tells the athlete what to do next for each answer", () => {
    const base = { athleteName: "Ava", coachName: "Tom", entryTitle: "400m", note: null, editorUrl: "https://roster.test/resume" };
    assert.match(verificationAnsweredEmail({ ...base, outcome: "verified", flaggedUnknownAthlete: false }).subject, /^Verified/);
    assert.match(verificationAnsweredEmail({ ...base, outcome: "disputed", flaggedUnknownAthlete: false }).text, /Fix the entry/);
    assert.match(verificationAnsweredEmail({ ...base, outcome: "disputed", flaggedUnknownAthlete: true }).text, /don't know you/);
  });
});

describe("sendEmail", () => {
  it("without RESEND_API_KEY, appends to the outbox and touches no network", async () => {
    globalThis.fetch = (() => {
      throw new Error("network used");
    }) as typeof fetch;
    const result = await sendEmail({ to: "coach@example.org", subject: "Hi", text: "t", html: "<p>t</p>", tag: "test" });
    assert.equal(result.via, "outbox");
    assert.equal(path.dirname(outboxFile()), dir);
    const last = readOutbox().at(-1)!;
    assert.equal(last.to, "coach@example.org");
    assert.equal(last.from, DEFAULT_EMAIL_FROM);
    assert.equal(last.id, result.id);
  });

  it("with RESEND_API_KEY, posts one JSON request to Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    let seen: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as typeof fetch;

    const before = readOutbox().length;
    const result = await sendEmail({ to: "coach@example.org", subject: "Hi", text: "t", html: "<p>t</p>", tag: "test" });
    assert.deepEqual(result, { via: "resend", id: "msg_1" });
    assert.equal(readOutbox().length, before, "nothing written to the outbox");
    assert.ok(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer re_test_123");
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.to, ["coach@example.org"]);
    assert.equal(body.from, DEFAULT_EMAIL_FROM);
  });

  it("a Resend refusal throws; the verification helpers swallow it", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    globalThis.fetch = (async () => new Response("domain not verified", { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(sendEmail({ to: "a@b.c", subject: "s", text: "t", html: "h", tag: "test" }), /403/);

    const quiet = console.error;
    console.error = () => {};
    try {
      const sent = await emailAthleteAnswer({
        athleteEmail: "a@b.c", athleteName: "Ava", coachName: "Tom", entryTitle: "400m",
        outcome: "verified", flaggedUnknownAthlete: false, note: null,
      });
      assert.equal(sent, false);
    } finally {
      console.error = quiet;
    }
  });
});

describe("verification emails", () => {
  it("emails the coach an absolute verify link (#75), and skips a coach with no address", async () => {
    const sent = await emailCoachRequest({
      coachEmail: "tbradley@example.org", coachName: "Tom Bradley", athleteName: "Ava Reyes",
      entryTitle: "400m", token: "tok_abc", expiresAt: "2026-12-05T00:00:00Z",
    });
    assert.equal(sent, true);
    const last = readOutbox().at(-1)!;
    assert.equal(last.tag, "verification_request");
    assert.ok(last.text.includes("https://roster.test/verify/tok_abc"));

    const count = readOutbox().length;
    assert.equal(
      await emailCoachRequest({ coachEmail: null, coachName: "X", athleteName: "Y", entryTitle: "Z", token: "t", expiresAt: "2026-12-05T00:00:00Z" }),
      false,
    );
    assert.equal(readOutbox().length, count);
  });

  it("emails the athlete the answer (#80)", async () => {
    const sent = await emailAthleteAnswer({
      athleteEmail: "ava@example.org", athleteName: "Ava", coachName: "Tom", entryTitle: "400m",
      outcome: "disputed", flaggedUnknownAthlete: false, note: "It was 54.9",
    });
    assert.equal(sent, true);
    const last = readOutbox().at(-1)!;
    assert.equal(last.tag, "verification_answered");
    assert.ok(last.text.includes("It was 54.9"));
    assert.ok(last.text.includes("https://roster.test/resume?section=requests"));
  });
});
