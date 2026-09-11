import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { LocalNetworkRepository, pruneLocalReportEvidence } from "../local";
import { readDb, mutate } from "@/lib/data/local/store";
import type { AuthUser } from "@/lib/data/types";
let directory: string;
let adult: LocalNetworkRepository,
  teen: LocalNetworkRepository,
  other: LocalNetworkRepository,
  staff: LocalNetworkRepository;
let users: AuthUser[];
before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "roster-network-"));
  process.env.ROSTER_DATA_DIR = directory;
  users = readDb()
    .users.slice(0, 4)
    .map((u) => ({ id: u.id, email: u.email, emailConfirmed: true }));
  [adult, teen, other, staff] = users.map((u) => new LocalNetworkRepository(u));
  mutate((db) => {
    db.profiles.find((p) => p.id === users[3].id)!.account_kind = "staff";
    db.profiles.find((p) => p.id === users[1].id)!.visibility = "private";
  });
});
after(() => fs.rmSync(directory, { recursive: true, force: true }));
test("membership requires confirmed identity, minimum age and immutable DOB", async () => {
  await assert.rejects(new LocalNetworkRepository(null).discover());
  await assert.rejects(
    new LocalNetworkRepository({
      ...users[0],
      emailConfirmed: false,
    }).joinNetwork("1990-01-01"),
  );
  await assert.rejects(adult.getFeed());
  await assert.rejects(adult.joinNetwork("2020-01-01"));
  await assert.rejects(adult.joinNetwork("2000-02-30"));
  await adult.joinNetwork("1990-01-01");
  await teen.joinNetwork(`${new Date().getUTCFullYear() - 15}-01-01`);
  await other.joinNetwork("1992-01-01");
  await staff.joinNetwork("1980-01-01");
  await assert.rejects(adult.joinNetwork("1989-01-01"));
  assert.equal((await adult.getMembership())?.status, "active");
  assert.deepEqual(Object.keys((await adult.getMembership())!).sort(), [
    "joinedAt",
    "status",
  ]);
});
test("summaries omit resume privacy and join does not publish private resume", async () => {
  const profile = readDb().profiles.find((p) => p.id === users[1].id)!;
  const member = await adult.getMember(profile.handle);
  assert.ok(member);
  assert.equal(member.publicResumeUrl, null);
  assert.equal(profile.visibility, "private");
  assert.equal("dob" in member, false);
  assert.equal("contact_email" in member, false);
  assert.equal("gpa" in member, false);
});
test("social membership exposes avatars but does not expose private resume covers", async () => {
  const avatar = `${users[1].id}/11111111-1111-4111-8111-111111111111.webp`;
  const cover = `${users[1].id}/22222222-2222-4222-8222-222222222222.webp`;
  mutate((db) => {
    const profile = db.profiles.find((p) => p.id === users[1].id)!;
    profile.avatar_url = `/api/media/${avatar}`;
    profile.cover_url = `/api/media/${cover}`;
  });
  assert.equal(await adult.canReadMedia(avatar), true);
  assert.equal(await adult.canReadMedia(cover), false);
});
test("following feed, pagination, ownership, likes and comments are durable", async () => {
  const a = await adult.publishPost({ text: "My first post" });
  const b = await teen.publishPost({ text: "Training today" });
  assert.equal((await adult.getFeed({ mode: "following" })).items.length, 1);
  await adult.setFollow(users[1].id, true);
  assert.equal((await adult.getFeed({ mode: "following" })).items.length, 2);
  const page = await adult.getFeed({ limit: 1 });
  assert.ok(page.nextCursor);
  const next = await adult.getFeed({ limit: 1, cursor: page.nextCursor });
  assert.notEqual(page.items[0].id, next.items[0].id);
  await assert.rejects(teen.updatePost(a.id, { text: "hijack" }));
  await teen.setLike(a.id, true);
  await teen.setLike(a.id, true);
  assert.equal((await adult.getPost(a.id))?.likeCount, 1);
  const comment = await teen.addComment(a.id, "Well done");
  assert.equal((await adult.getComments(a.id)).length, 1);
  await assert.rejects(other.deleteComment(comment.id));
  await teen.deleteComment(comment.id);
  assert.equal((await adult.getComments(a.id)).length, 0);
  assert.equal(
    (await new LocalNetworkRepository(users[0]).getPost(b.id))?.text,
    "Training today",
  );
});
test("image authorization and supported film URLs are enforced", async () => {
  await assert.rejects(
    adult.publishPost({ text: "x", images: [`${users[0].id}/missing.webp`] }),
  );
  const invalidPath = `${users[0].id}/a.webp`;
  fs.mkdirSync(path.join(directory, "media", users[0].id), { recursive: true });
  fs.writeFileSync(path.join(directory, "media", invalidPath), "short name");
  await assert.rejects(
    adult.publishPost({ text: "invalid path", images: [invalidPath] }),
  );
  const mediaPath = `${users[0].id}/11111111-1111-4111-8111-111111111111.webp`;
  fs.mkdirSync(path.join(directory, "media", users[0].id), { recursive: true });
  fs.writeFileSync(path.join(directory, "media", mediaPath), "test");
  await assert.rejects(teen.publishPost({ text: "x", images: [mediaPath] }));
  await assert.rejects(
    adult.publishPost({
      text: "x",
      filmUrl: "https://youtube.com.evil.test/watch?v=x",
    }),
  );
  await assert.rejects(
    adult.publishPost({ text: "x", filmUrl: "http://youtube.com/watch?v=x" }),
  );
  const p = await adult.publishPost({ text: "photo", images: [mediaPath] });
  assert.equal(await teen.canReadMedia(mediaPath), true);
  await adult.deletePost(p.id);
  assert.equal(await teen.canReadMedia(mediaPath), false);
});
test("teens require mutual follows; requests allow one intro until recipient accepts", async () => {
  await assert.rejects(
    adult.requestConversation(users[1].id, "hello", "intro0001"),
  );
  await teen.setFollow(users[0].id, true);
  const c = await adult.requestConversation(users[1].id, "hello", "intro0001");
  assert.equal(
    (await adult.requestConversation(users[1].id, "hello", "intro0001")).id,
    c.id,
  );
  await assert.rejects(adult.sendMessage(c.id, "again", "message01"));
  await assert.rejects(adult.respondConversation(c.id, true));
  await teen.respondConversation(c.id, true);
  const msg = await adult.sendMessage(c.id, "Thanks", "message01");
  assert.equal(
    (await adult.sendMessage(c.id, "Thanks", "message01")).id,
    msg.id,
  );
  await assert.rejects(adult.sendMessage(c.id, "changed", "message01"));
  assert.equal((await teen.getUnreadCounts()).messages, 2);
  await teen.markConversationRead(c.id);
  assert.equal((await teen.getUnreadCounts()).messages, 0);
  await assert.rejects(other.getMessages(c.id));
});
test("decline prevents retry and blocks suppress content, notifications, contact and media", async () => {
  const c = await other.requestConversation(users[0].id, "Intro", "intro0002");
  await adult.respondConversation(c.id, false);
  await assert.rejects(
    other.requestConversation(users[0].id, "Retry", "intro0003"),
  );
  await adult.setBlock(users[1].id, true);
  assert.equal((await adult.getBlockedMembers())[0].id, users[1].id);
  assert.equal(
    (await adult.getFeed()).items.some((p) => p.author.id === users[1].id),
    false,
  );
  assert.equal(
    (await teen.getFeed()).items.some((p) => p.author.id === users[0].id),
    false,
  );
  assert.equal(
    (await adult.getConversations()).some((c) => c.member.id === users[1].id),
    false,
  );
  assert.equal(
    (await adult.getNotifications()).some((n) => n.actor.id === users[1].id),
    false,
  );
  await assert.rejects(teen.setFollow(users[0].id, true));
  await adult.setBlock(users[1].id, false);
});
test("moderation is staff-only, audited, reversible; evidence survives account cleanup", async () => {
  const post = await other.publishPost({ text: "Reportable content" });
  await adult.report("post", post.id, "Spam");
  await assert.rejects(adult.getReports());
  await assert.rejects(
    adult.moderate({
      targetType: "post",
      targetId: post.id,
      action: "remove",
      reason: "spam",
    }),
  );
  const report = (await staff.getReports()).find(
    (r) => r.targetId === post.id,
  )!;
  await staff.moderate({
    targetType: "post",
    targetId: post.id,
    action: "remove",
    reason: "Spam",
    reportId: report.id,
  });
  assert.equal(await adult.getPost(post.id), null);
  await staff.moderate({
    targetType: "post",
    targetId: post.id,
    action: "restore",
    reason: "Appeal accepted",
  });
  assert.ok(await adult.getPost(post.id));
  await staff.moderate({
    targetType: "member",
    targetId: users[2].id,
    action: "remove",
    reason: "Suspension",
  });
  await assert.rejects(other.discover());
  await staff.moderate({
    targetType: "member",
    targetId: users[2].id,
    action: "restore",
    reason: "Restored",
  });
  await other.deleteAccountData();
  assert.ok(
    (await staff.getReports()).find((r) => r.id === report.id)?.evidence,
  );
  assert.equal(await adult.getPost(post.id), null);
  const state = JSON.parse(
    fs.readFileSync(path.join(directory, "network.json"), "utf8"),
  );
  assert.equal(state.audit.length, 4);
});
test("verification requests and outcomes derive private notifications and persist read state", async () => {
  const requestId = "verification-notification-test";
  mutate((db) => {
    db.profiles.find((p) => p.id === users[1].id)!.account_kind = "coach";
    db.verification_requests.push({
      id: requestId,
      token: "private-token",
      achievement_id: db.achievements.find((a) => a.profile_id === users[0].id)!
        .id,
      profile_id: users[0].id,
      coach_contact_id: "test-coach",
      recipient_email: users[1].email,
      status: "pending",
      note: null,
      verifier_name: null,
      verifier_role: null,
      created_at: new Date().toISOString(),
      responded_at: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
  });
  let notification = (await teen.getNotifications()).find(
    (n) => n.targetId === requestId,
  );
  assert.equal(notification?.kind, "verification_request");
  assert.equal(notification?.href, `/verify/${requestId}`);
  assert.equal(JSON.stringify(notification).includes("private-token"), false);
  assert.equal(JSON.stringify(notification).includes(users[1].email), false);
  await teen.markNotificationsRead();
  notification = (
    await new LocalNetworkRepository(users[1]).getNotifications()
  ).find((n) => n.targetId === requestId);
  assert.equal(notification?.read, true);
  mutate((db) => {
    const request = db.verification_requests.find((r) => r.id === requestId)!;
    request.status = "verified";
    request.responded_at = new Date().toISOString();
  });
  assert.equal(
    (await teen.getNotifications()).some((n) => n.targetId === requestId),
    false,
  );
  assert.equal(
    (await adult.getNotifications()).find((n) => n.targetId === requestId)
      ?.kind,
    "verification_verified",
  );
});
test("report image bytes survive ordinary deletion and expire after resolution retention", async () => {
  const mediaPath = `${users[0].id}/22222222-2222-4222-8222-222222222222.webp`;
  fs.writeFileSync(
    path.join(directory, "media", mediaPath),
    "private image bytes",
  );
  const post = await adult.publishPost({
    text: "Image report",
    images: [mediaPath],
  });
  await teen.report("post", post.id, "Report image");
  const report = (await staff.getReports()).find(
    (r) => r.targetId === post.id,
  )!;
  await adult.deleteAccountData();
  await assert.rejects(
    teen.moderate({
      targetType: "post",
      targetId: post.id,
      action: "resolve",
      reportId: report.id,
      reason: "Closed",
    }),
  );
  await assert.rejects(
    staff.moderate({
      targetType: "post",
      targetId: "wrong",
      action: "resolve",
      reportId: report.id,
      reason: "Closed",
    }),
  );
  await assert.rejects(
    staff.moderate({
      targetType: "post",
      targetId: post.id,
      action: "resolve",
      reason: "Closed",
    }),
  );
  await staff.moderate({
    targetType: "post",
    targetId: post.id,
    action: "resolve",
    reportId: report.id,
    reason: "Account deleted; report reviewed",
  });
  const resolvedAt = (await staff.getReports()).find(
    (r) => r.id === report.id,
  )!.resolvedAt;
  assert.ok(resolvedAt);
  await staff.moderate({
    targetType: "post",
    targetId: post.id,
    action: "resolve",
    reportId: report.id,
    reason: "Duplicate review",
  });
  assert.equal(
    (await staff.getReports()).find((r) => r.id === report.id)!.resolvedAt,
    resolvedAt,
  );
  fs.rmSync(path.join(directory, "media", mediaPath));
  const evidencePath = path.join(
    directory,
    "network-evidence",
    report.id,
    "22222222-2222-4222-8222-222222222222.webp",
  );
  assert.equal(fs.readFileSync(evidencePath, "utf8"), "private image bytes");
  const file = path.join(directory, "network.json"),
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  state.reports.find((r: { id: string }) => r.id === report.id).resolvedAt =
    new Date(Date.now() - 91 * 86400000).toISOString();
  fs.writeFileSync(file, JSON.stringify(state));
  await pruneLocalReportEvidence();
  assert.equal(fs.existsSync(evidencePath), false);
  assert.equal(
    (await staff.getReports()).some((r) => r.id === report.id),
    false,
  );
});
