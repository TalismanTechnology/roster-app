import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readDb } from "@/lib/data/local/store";
import { dataDir } from "@/lib/data/local/paths";
import { DataError, type AuthUser } from "@/lib/data/types";
import type { NetworkRepository } from "./repository";
import type {
  Comment,
  Conversation,
  FeedQuery,
  MemberSummary,
  Message,
  ModerationInput,
  NetworkMembership,
  Notification,
  Post,
  PostInput,
  Report,
  ReportTarget,
} from "./types";
type MemberRow = NetworkMembership & {
  id: string;
  dob: string;
};
type PostRow = Omit<Post, "author" | "liked" | "likeCount" | "commentCount"> & {
  authorId: string;
  removed: boolean;
};
type CommentRow = Omit<Comment, "author"> & {
  authorId: string;
  removed: boolean;
};
type ConversationRow = {
  id: string;
  senderId: string;
  recipientId: string;
  status: Conversation["status"];
  createdAt: string;
  readAt: Record<string, string>;
};
type MessageRow = Message & {
  key: string;
  removed: boolean;
};
type NotificationRow = Omit<Notification, "actor"> & {
  actorId: string;
  recipientId: string;
};
type State = {
  members: MemberRow[];
  posts: PostRow[];
  comments: CommentRow[];
  likes: {
    memberId: string;
    postId: string;
  }[];
  follows: {
    from: string;
    to: string;
  }[];
  blocks: {
    from: string;
    to: string;
  }[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  notifications: NotificationRow[];
  verificationRead: { memberId: string; notificationId: string }[];
  reports: Report[];
  audit: {
    actorId: string;
    input: ModerationInput;
    createdAt: string;
  }[];
};
const initial = (): State => ({
  members: [],
  posts: [],
  comments: [],
  likes: [],
  follows: [],
  blocks: [],
  conversations: [],
  messages: [],
  notifications: [],
  verificationRead: [],
  reports: [],
  audit: [],
});
const now = () => new Date().toISOString();
function fail(
  message: string,
  code: "invalid" | "forbidden" | "not_found" | "conflict" = "forbidden",
): never {
  throw new DataError(code, message);
}
function load(): State {
  const file = path.join(dataDir(), "network.json");
  return fs.existsSync(file)
    ? { ...initial(), ...(JSON.parse(fs.readFileSync(file, "utf8")) as State) }
    : initial();
}
// A filesystem lock serializes read/modify/rename across Next worker processes.
async function transaction<T>(fn: (state: State) => T): Promise<T> {
  fs.mkdirSync(dataDir(), { recursive: true });
  const lock = path.join(dataDir(), "network.lock");
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline)
        throw new DataError(
          "unavailable",
          "Network storage is busy. Please retry.",
        );
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  try {
    const state = load();
    const result = fn(state);
    for (const report of state.reports)
      if (
        report.resolvedAt &&
        Date.now() - Date.parse(report.resolvedAt) >= 90 * 86400000
      )
        fs.rmSync(path.join(dataDir(), "network-evidence", report.id), {
          recursive: true,
          force: true,
        });
    state.reports = state.reports.filter(
      (r) =>
        !r.resolvedAt || Date.now() - Date.parse(r.resolvedAt) < 90 * 86400000,
    );
    const file = path.join(dataDir(), "network.json");
    const tmp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return result;
  } finally {
    fs.rmdirSync(lock);
  }
}
function age(dob: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob))
    fail("Enter a valid date of birth.", "invalid");
  const date = new Date(`${dob}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== dob
  )
    fail("Enter a valid date of birth.", "invalid");
  const today = new Date();
  return (
    today.getUTCFullYear() -
    date.getUTCFullYear() -
    (today.toISOString().slice(5, 10) < dob.slice(5) ? 1 : 0)
  );
}
function body(text: string): string {
  if (typeof text !== "string" || !text.trim() || text.trim().length > 2000)
    fail("Enter between 1 and 2,000 characters.", "invalid");
  return text.trim();
}
function keyCheck(key: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
    fail("A valid request key is required.", "invalid");
}
export class LocalNetworkRepository implements NetworkRepository {
  constructor(private readonly actor: AuthUser | null) {}
  private identity(): string {
    if (
      !this.actor ||
      !this.actor.emailConfirmed ||
      !readDb().users.some((u) => u.id === this.actor!.id)
    )
      fail("Sign in with a confirmed email.");
    return this.actor.id;
  }
  private active(s: State): string {
    const id = this.identity();
    if (!s.members.some((m) => m.id === id && m.status === "active"))
      fail("Join the network to continue.");
    return id;
  }
  private visible(s: State, id: string, actor = this.identity()): boolean {
    return (
      s.members.some((m) => m.id === id && m.status === "active") &&
      readDb().profiles.some((p) => p.id === id) &&
      !s.blocks.some(
        (b) =>
          (b.from === id && b.to === actor) ||
          (b.to === id && b.from === actor),
      )
    );
  }
  private summary(id: string): MemberSummary {
    const p = readDb().profiles.find((p) => p.id === id);
    if (!p) fail("Member not found.", "not_found");
    return {
      id: p.id,
      handle: p.handle,
      name: p.display_name,
      avatar: p.avatar_url,
      role: p.account_kind,
      sport: p.primary_sport,
    };
  }
  private notify(
    s: State,
    recipientId: string,
    kind: Notification["kind"],
    targetId: string,
  ) {
    const actorId = this.identity();
    if (actorId !== recipientId)
      s.notifications.push({
        id: randomUUID(),
        recipientId,
        actorId,
        kind,
        targetId,
        createdAt: now(),
        read: false,
      });
  }
  private post(s: State, id: string): PostRow {
    this.active(s);
    const p = s.posts.find(
      (p) => p.id === id && !p.removed && this.visible(s, p.authorId),
    );
    if (!p) fail("Post not found.", "not_found");
    return p;
  }
  private renderPost(s: State, p: PostRow): Post {
    return {
      id: p.id,
      author: this.summary(p.authorId),
      text: p.text,
      images: p.images,
      filmUrl: p.filmUrl,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      liked: s.likes.some(
        (l) => l.postId === p.id && l.memberId === this.identity(),
      ),
      likeCount: s.likes.filter(
        (l) => l.postId === p.id && this.visible(s, l.memberId),
      ).length,
      commentCount: s.comments.filter(
        (c) => c.postId === p.id && !c.removed && this.visible(s, c.authorId),
      ).length,
    };
  }
  private postInput(input: PostInput): Required<PostInput> {
    const images = input.images ?? [];
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (text.length > 2000 || (!text && !images.length && !input.filmUrl))
      fail("Add a post of up to 2,000 characters.", "invalid");
    if (images.length > 4 || new Set(images).size !== images.length)
      fail("Choose up to four images.", "invalid");
    for (const image of images) {
      if (
        !image.startsWith(`${this.identity()}/`) ||
        image.includes("..") ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(
          image,
        ) ||
        !fs.existsSync(path.join(dataDir(), "media", image))
      )
        fail("Image upload is not authorized.", "invalid");
    }
    let filmUrl = input.filmUrl?.trim() || null;
    if (filmUrl) {
      try {
        const url = new URL(filmUrl);
        if (
          url.protocol !== "https:" ||
          ![
            "youtube.com",
            "www.youtube.com",
            "youtu.be",
            "vimeo.com",
            "www.vimeo.com",
            "hudl.com",
            "www.hudl.com",
          ].includes(url.hostname) ||
          url.username ||
          url.password
        )
          fail("Use a supported HTTPS film link.", "invalid");
        filmUrl = url.href;
      } catch {
        fail("Use a supported HTTPS film link.", "invalid");
      }
    }
    if (images.length && filmUrl)
      fail("Choose images or a film link.", "invalid");
    return { text, images, filmUrl };
  }
  async canReadMedia(mediaPath: string) {
    const s = load(),
      id = this.active(s);
    const owner = mediaPath.split("/")[0];
    if (!this.visible(s, owner, id)) return false;
    const profile = readDb().profiles.find((p) => p.id === owner);
    return (
      s.posts.some(
        (p) =>
          p.authorId === owner && !p.removed && p.images.includes(mediaPath),
      ) ||
      profile?.avatar_url === `/api/media/${mediaPath}`
    );
  }
  async isModerator() {
    const id = this.identity();
    return readDb().profiles.some(
      (p) => p.id === id && p.account_kind === "staff",
    );
  }
  async getMembership() {
    const m = load().members.find((m) => m.id === this.identity());
    return m ? { status: m.status, joinedAt: m.joinedAt } : null;
  }
  async joinNetwork(dob: string) {
    return transaction((s) => {
      const id = this.identity();
      const old = s.members.find((m) => m.id === id);
      if (old) {
        if (old.dob !== dob) fail("Date of birth cannot be changed.");
        return { status: old.status, joinedAt: old.joinedAt };
      }
      if (!readDb().profiles.some((p) => p.id === id))
        fail("Create a profile before joining.");
      if (age(dob) < 13 || age(dob) > 120)
        fail("Members must be at least 13.", "invalid");
      const m: MemberRow = { id, dob, status: "active", joinedAt: now() };
      s.members.push(m);
      return { status: m.status, joinedAt: m.joinedAt };
    });
  }
  async getFeed(query: FeedQuery = {}) {
    const s = load(),
      id = this.active(s);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const rows = s.posts
      .filter(
        (p) =>
          !p.removed &&
          this.visible(s, p.authorId) &&
          (!query.memberId || p.authorId === query.memberId) &&
          (query.mode !== "following" ||
            p.authorId === id ||
            s.follows.some((f) => f.from === id && f.to === p.authorId)),
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    const filtered = query.cursor
      ? rows.filter((p) => `${p.createdAt}|${p.id}` < query.cursor!)
      : rows;
    const items = filtered.slice(0, limit);
    return {
      items: items.map((p) => this.renderPost(s, p)),
      nextCursor:
        filtered.length > limit
          ? `${items.at(-1)!.createdAt}|${items.at(-1)!.id}`
          : null,
    };
  }
  async getPost(id: string) {
    const s = load();
    this.active(s);
    const p = s.posts.find(
      (p) => p.id === id && !p.removed && this.visible(s, p.authorId),
    );
    return p ? this.renderPost(s, p) : null;
  }
  async publishPost(input: PostInput) {
    return transaction((s) => {
      const authorId = this.active(s),
        data = this.postInput(input),
        time = now();
      const p: PostRow = {
        ...data,
        id: randomUUID(),
        authorId,
        createdAt: time,
        updatedAt: time,
        removed: false,
      };
      s.posts.push(p);
      return this.renderPost(s, p);
    });
  }
  async updatePost(id: string, input: PostInput) {
    return transaction((s) => {
      const p = this.post(s, id);
      if (p.authorId !== this.identity()) fail("Only the author can edit.");
      Object.assign(p, this.postInput(input), { updatedAt: now() });
      return this.renderPost(s, p);
    });
  }
  async deletePost(id: string) {
    await transaction((s) => {
      const p = this.post(s, id);
      if (p.authorId !== this.identity()) fail("Only the author can delete.");
      p.removed = true;
    });
  }
  async setLike(postId: string, liked: boolean) {
    await transaction((s) => {
      const p = this.post(s, postId),
        memberId = this.identity();
      const old = s.likes.some(
        (l) => l.postId === postId && l.memberId === memberId,
      );
      s.likes = s.likes.filter(
        (l) => l.postId !== postId || l.memberId !== memberId,
      );
      if (liked) {
        s.likes.push({ postId, memberId });
        if (!old) this.notify(s, p.authorId, "like", postId);
      }
    });
  }
  async getComments(postId: string) {
    const s = load();
    this.post(s, postId);
    return s.comments
      .filter(
        (c) => c.postId === postId && !c.removed && this.visible(s, c.authorId),
      )
      .map((c) => ({
        id: c.id,
        postId: c.postId,
        author: this.summary(c.authorId),
        text: c.text,
        createdAt: c.createdAt,
      }));
  }
  async addComment(postId: string, text: string) {
    return transaction((s) => {
      const p = this.post(s, postId);
      const c: CommentRow = {
        id: randomUUID(),
        postId,
        authorId: this.identity(),
        text: body(text),
        createdAt: now(),
        removed: false,
      };
      s.comments.push(c);
      this.notify(s, p.authorId, "comment", postId);
      return {
        id: c.id,
        postId,
        author: this.summary(c.authorId),
        text: c.text,
        createdAt: c.createdAt,
      };
    });
  }
  async deleteComment(id: string) {
    await transaction((s) => {
      this.active(s);
      const c = s.comments.find((c) => c.id === id);
      if (!c || c.authorId !== this.identity()) fail("Comment unavailable.");
      c.removed = true;
    });
  }
  async discover(query = "") {
    const s = load();
    this.active(s);
    return s.members
      .filter((m) => this.visible(s, m.id))
      .map((m) => this.summary(m.id))
      .filter((m) =>
        `${m.name} ${m.handle} ${m.sport ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .slice(0, 50);
  }
  private canMessage(s: State, to: string) {
    const id = this.identity();
    const recipient = s.members.find((m) => m.id === to);
    return (
      id !== to &&
      this.visible(s, to) &&
      !!recipient &&
      (age(recipient.dob) >= 18 ||
        (s.follows.some((f) => f.from === id && f.to === to) &&
          s.follows.some((f) => f.from === to && f.to === id))) &&
      !s.conversations.some(
        (c) =>
          ((c.senderId === id && c.recipientId === to) ||
            (c.senderId === to && c.recipientId === id)) &&
          c.status === "declined",
      )
    );
  }
  async getMember(handle: string) {
    const s = load(),
      id = this.active(s);
    const p = readDb().profiles.find((p) => p.handle === handle);
    if (!p || !this.visible(s, p.id)) return null;
    return {
      ...this.summary(p.id),
      publicResumeUrl: p.visibility === "public" ? `/${p.handle}` : null,
      following: s.follows.some((f) => f.from === id && f.to === p.id),
      followerCount: s.follows.filter(
        (f) => f.to === p.id && this.visible(s, f.from),
      ).length,
      followingCount: s.follows.filter(
        (f) => f.from === p.id && this.visible(s, f.to),
      ).length,
      canMessage: this.canMessage(s, p.id),
    };
  }
  async setFollow(memberId: string, following: boolean) {
    await transaction((s) => {
      const id = this.active(s);
      if (id === memberId || !this.visible(s, memberId))
        fail("Member unavailable.");
      const old = s.follows.some((f) => f.from === id && f.to === memberId);
      s.follows = s.follows.filter((f) => f.from !== id || f.to !== memberId);
      if (following) {
        s.follows.push({ from: id, to: memberId });
        if (!old) this.notify(s, memberId, "follow", id);
      }
    });
  }
  async getBlockedMembers() {
    const s = load(),
      id = this.active(s);
    return s.blocks
      .filter(
        (b) => b.from === id && readDb().profiles.some((p) => p.id === b.to),
      )
      .map((b) => this.summary(b.to));
  }
  async setBlock(memberId: string, blocked: boolean) {
    await transaction((s) => {
      const id = this.active(s);
      if (id === memberId || !s.members.some((m) => m.id === memberId))
        fail("Member unavailable.");
      s.blocks = s.blocks.filter((b) => b.from !== id || b.to !== memberId);
      if (blocked) {
        s.blocks.push({ from: id, to: memberId });
        s.follows = s.follows.filter(
          (f) =>
            !(
              (f.from === id && f.to === memberId) ||
              (f.from === memberId && f.to === id)
            ),
        );
      }
    });
  }
  private conversation(s: State, id: string) {
    const actor = this.active(s);
    const c = s.conversations.find(
      (c) => c.id === id && (c.senderId === actor || c.recipientId === actor),
    );
    if (
      !c ||
      !this.visible(s, c.senderId === actor ? c.recipientId : c.senderId)
    )
      fail("Conversation unavailable.", "not_found");
    return c;
  }
  private renderConversation(s: State, c: ConversationRow): Conversation {
    const id = this.identity(),
      messages = s.messages.filter(
        (m) => m.conversationId === c.id && !m.removed,
      );
    return {
      id: c.id,
      member: this.summary(c.senderId === id ? c.recipientId : c.senderId),
      status: c.status,
      incoming: c.recipientId === id,
      unreadCount: messages.filter(
        (m) => m.senderId !== id && m.createdAt > (c.readAt[id] ?? ""),
      ).length,
      lastMessage: messages.length
        ? this.renderMessage(messages[messages.length - 1])
        : null,
      createdAt: c.createdAt,
    };
  }
  private renderMessage(m: MessageRow): Message {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      text: m.text,
      createdAt: m.createdAt,
    };
  }
  async getConversations() {
    const s = load(),
      id = this.active(s);
    return s.conversations
      .filter(
        (c) =>
          (c.senderId === id || c.recipientId === id) &&
          this.visible(s, c.senderId === id ? c.recipientId : c.senderId),
      )
      .map((c) => this.renderConversation(s, c))
      .sort((a, b) =>
        (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(
          a.lastMessage?.createdAt ?? a.createdAt,
        ),
      );
  }
  async requestConversation(memberId: string, text: string, key: string) {
    return transaction((s) => {
      const id = this.active(s);
      keyCheck(key);
      const content = body(text);
      if (!this.canMessage(s, memberId))
        fail("Messaging is unavailable for this member.");
      let c = s.conversations.find(
        (c) =>
          (c.senderId === id && c.recipientId === memberId) ||
          (c.senderId === memberId && c.recipientId === id),
      );
      if (c) {
        const old = s.messages.find((m) => m.senderId === id && m.key === key);
        if (old?.conversationId === c.id && old.text === content)
          return this.renderConversation(s, c);
        fail("A conversation already exists.", "conflict");
      }
      if (s.messages.some((m) => m.senderId === id && m.key === key))
        fail("Request key already used.", "conflict");
      c = {
        id: randomUUID(),
        senderId: id,
        recipientId: memberId,
        status: "pending",
        createdAt: now(),
        readAt: {},
      };
      s.conversations.push(c);
      s.messages.push({
        id: randomUUID(),
        conversationId: c.id,
        senderId: id,
        text: content,
        key,
        createdAt: now(),
        removed: false,
      });
      this.notify(s, memberId, "request", c.id);
      return this.renderConversation(s, c);
    });
  }
  async respondConversation(id: string, accept: boolean) {
    await transaction((s) => {
      const c = this.conversation(s, id);
      if (c.recipientId !== this.identity() || c.status !== "pending")
        fail("Only the recipient can respond to a pending request.");
      c.status = accept ? "accepted" : "declined";
    });
  }
  async getMessages(id: string) {
    const s = load();
    this.conversation(s, id);
    return s.messages
      .filter((m) => m.conversationId === id && !m.removed)
      .map((m) => this.renderMessage(m));
  }
  async sendMessage(id: string, text: string, key: string) {
    return transaction((s) => {
      const c = this.conversation(s, id);
      if (c.status !== "accepted")
        fail("Wait for the recipient to accept your request.");
      keyCheck(key);
      const content = body(text),
        senderId = this.identity();
      const old = s.messages.find(
        (m) => m.senderId === senderId && m.key === key,
      );
      if (old) {
        if (old.conversationId !== id || old.text !== content)
          fail("Request key already used.", "conflict");
        return this.renderMessage(old);
      }
      const m: MessageRow = {
        id: randomUUID(),
        conversationId: id,
        senderId,
        text: content,
        key,
        createdAt: now(),
        removed: false,
      };
      s.messages.push(m);
      this.notify(
        s,
        c.senderId === senderId ? c.recipientId : c.senderId,
        "message",
        id,
      );
      return this.renderMessage(m);
    });
  }
  async markConversationRead(id: string) {
    await transaction((s) => {
      this.conversation(s, id).readAt[this.identity()] = now();
    });
  }
  private verificationNotifications(state: State): Notification[] {
    const id = this.identity(),
      core = readDb(),
      own = core.profiles.find((p) => p.id === id);
    const system: MemberSummary = {
      id: "roster",
      handle: "",
      name: "Roster verification",
      avatar: null,
      role: "system",
      sport: null,
    };
    return core.verification_requests.flatMap((request) => {
      const invitedEmail =
        request.recipient_email ??
        core.coach_contacts.find((c) => c.id === request.coach_contact_id)
          ?.email;
      const incoming =
        request.status === "pending" &&
        Date.parse(request.expires_at) > Date.now() &&
        own?.account_kind === "coach" &&
        invitedEmail?.toLowerCase() === this.actor!.email.toLowerCase();
      const outcome =
        request.profile_id === id &&
        (request.status === "verified" || request.status === "disputed");
      if (!incoming && !outcome) return [];
      const actorId = incoming
        ? request.profile_id
        : core.users.find(
            (u) => u.email.toLowerCase() === invitedEmail?.toLowerCase(),
          )?.id;
      if (
        actorId &&
        state.blocks.some(
          (b) =>
            (b.from === id && b.to === actorId) ||
            (b.from === actorId && b.to === id),
        )
      )
        return [];
      const kind: Notification["kind"] = incoming
        ? "verification_request"
        : request.status === "verified"
          ? "verification_verified"
          : "verification_disputed";
      const notificationId = `${kind}:${request.id}`;
      return [
        {
          id: notificationId,
          kind,
          actor:
            actorId && this.visible(state, actorId)
              ? this.summary(actorId)
              : system,
          targetId: request.id,
          href: `/verify/${request.id}`,
          createdAt: incoming
            ? request.created_at
            : (request.responded_at ?? request.created_at),
          read: state.verificationRead.some(
            (r) => r.memberId === id && r.notificationId === notificationId,
          ),
        },
      ];
    });
  }
  async getNotifications(): Promise<Notification[]> {
    const s = load(),
      id = this.active(s);
    const social = s.notifications
      .filter((n) => n.recipientId === id && this.visible(s, n.actorId))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        actor: this.summary(n.actorId),
        targetId: n.targetId,
        createdAt: n.createdAt,
        read: n.read,
      }));
    return [...social, ...this.verificationNotifications(s)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }
  async markNotificationsRead() {
    await transaction((s) => {
      const id = this.active(s);
      s.notifications
        .filter((n) => n.recipientId === id)
        .forEach((n) => (n.read = true));
      for (const n of this.verificationNotifications(s))
        if (!n.read)
          s.verificationRead.push({ memberId: id, notificationId: n.id });
    });
  }
  async getUnreadCounts() {
    return {
      messages: (await this.getConversations()).reduce(
        (n, c) => n + c.unreadCount,
        0,
      ),
      notifications: (await this.getNotifications()).filter((n) => !n.read)
        .length,
    };
  }
  async report(targetType: ReportTarget, targetId: string, reason: string) {
    await transaction((s) => {
      const reporterId = this.active(s);
      let evidence: unknown;
      if (targetType === "post") evidence = this.post(s, targetId);
      else if (targetType === "comment") {
        const c = s.comments.find(
          (c) => c.id === targetId && !c.removed && this.visible(s, c.authorId),
        );
        if (!c) fail("Comment unavailable.");
        this.post(s, c.postId);
        evidence = c;
      } else if (targetType === "message") {
        const m = s.messages.find((m) => m.id === targetId && !m.removed);
        if (!m) fail("Message unavailable.");
        this.conversation(s, m.conversationId);
        evidence = m;
      } else if (targetType === "member") {
        if (!this.visible(s, targetId)) fail("Member unavailable.");
        evidence = this.summary(targetId);
      } else fail("Invalid report target.", "invalid");
      const reportId = randomUUID();
      const reportReason = body(reason);
      if (targetType === "post") {
        const post = evidence as PostRow;
        for (const image of post.images) {
          const source = path.join(dataDir(), "media", image);
          const destination = path.join(
            dataDir(),
            "network-evidence",
            reportId,
            path.basename(image),
          );
          fs.mkdirSync(path.dirname(destination), {
            recursive: true,
            mode: 0o700,
          });
          fs.copyFileSync(source, destination);
          fs.chmodSync(destination, 0o600);
        }
      }
      s.reports.push({
        id: reportId,
        reporterId,
        targetType,
        targetId,
        reason: reportReason,
        createdAt: now(),
        resolvedAt: null,
        evidence: structuredClone(evidence),
      });
    });
  }
  private staff(s: State) {
    const id = this.active(s);
    if (
      !readDb().profiles.some((p) => p.id === id && p.account_kind === "staff")
    )
      fail("Staff access required.");
    return id;
  }
  async getReports() {
    const s = load();
    this.staff(s);
    return s.reports.filter(
      (r) =>
        !r.resolvedAt || Date.now() - Date.parse(r.resolvedAt) < 90 * 86400000,
    );
  }
  async moderate(input: ModerationInput) {
    await transaction((s) => {
      const actorId = this.staff(s);
      body(input.reason);
      if (!["remove", "restore", "resolve"].includes(input.action))
        fail("Invalid moderation action.", "invalid");
      if (input.action === "resolve") {
        if (!input.reportId) fail("Choose a report to resolve.", "invalid");
      } else if (input.targetType === "member") {
        const m = s.members.find((m) => m.id === input.targetId);
        if (!m) fail("Member unavailable.");
        if (m.id === actorId) fail("Cannot suspend yourself.");
        m.status = input.action === "remove" ? "suspended" : "active";
      } else {
        const rows =
          input.targetType === "post"
            ? s.posts
            : input.targetType === "comment"
              ? s.comments
              : input.targetType === "message"
                ? s.messages
                : null;
        const row = rows?.find((r) => r.id === input.targetId);
        if (!row) fail("Content unavailable.");
        row.removed = input.action === "remove";
      }
      if (input.reportId) {
        const r = s.reports.find(
          (r) =>
            r.id === input.reportId &&
            r.targetType === input.targetType &&
            r.targetId === input.targetId,
        );
        if (!r) fail("Report does not match target.");
        r.resolvedAt ??= now();
      }
      s.audit.push({ actorId, input, createdAt: now() });
    });
  }
  async deleteAccountData() {
    await transaction((s) => {
      const id = this.identity();
      const posts = s.posts.filter((p) => p.authorId === id).map((p) => p.id);
      const conv = s.conversations
        .filter((c) => c.senderId === id || c.recipientId === id)
        .map((c) => c.id);
      s.verificationRead = s.verificationRead.filter((r) => r.memberId !== id);
      const membership = s.members.find((m) => m.id === id);
      if (membership) membership.status = "suspended";
      s.posts = s.posts.filter((p) => p.authorId !== id);
      s.comments = s.comments.filter(
        (c) => c.authorId !== id && !posts.includes(c.postId),
      );
      s.likes = s.likes.filter(
        (l) => l.memberId !== id && !posts.includes(l.postId),
      );
      s.follows = s.follows.filter((f) => f.from !== id && f.to !== id);
      s.blocks = s.blocks.filter((b) => b.from !== id && b.to !== id);
      s.conversations = s.conversations.filter((c) => !conv.includes(c.id));
      s.messages = s.messages.filter((m) => !conv.includes(m.conversationId));
      s.notifications = s.notifications.filter(
        (n) => n.actorId !== id && n.recipientId !== id,
      );
    });
  }
}
/** Called by account deletion only after the core auth identity is gone. */
export async function finalizeDeletedLocalNetworkAccount(
  userId: string,
): Promise<void> {
  if (readDb().users.some((user) => user.id === userId))
    fail("Delete the account identity before final cleanup.");
  await transaction((state) => {
    state.members = state.members.filter((member) => member.id !== userId);
  });
}

/** Local scheduled maintenance; callers cannot select identities or report data. */
export async function pruneLocalReportEvidence(): Promise<void> {
  await transaction((state) => {
    const directory = path.join(dataDir(), "network-evidence");
    if (fs.existsSync(directory))
      for (const item of fs.readdirSync(directory))
        if (!state.reports.some((report) => report.id === item))
          fs.rmSync(path.join(directory, item), {
            recursive: true,
            force: true,
          });
  });
}
