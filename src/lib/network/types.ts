export type MemberSummary = {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  role: string;
  sport: string | null;
};
export type NetworkMembership = {
  status: "active" | "suspended";
  joinedAt: string;
};
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
export type PostInput = {
  text: string;
  images?: string[];
  filmUrl?: string | null;
};
export type Post = {
  id: string;
  author: MemberSummary;
  text: string;
  images: string[];
  filmUrl: string | null;
  createdAt: string;
  updatedAt: string;
  liked: boolean;
  likeCount: number;
  commentCount: number;
};
export type Comment = {
  id: string;
  postId: string;
  author: MemberSummary;
  text: string;
  createdAt: string;
};
export type MemberDetail = MemberSummary & {
  publicResumeUrl: string | null;
  following: boolean;
  followerCount: number;
  followingCount: number;
  canMessage: boolean;
};
export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
};
export type Conversation = {
  id: string;
  member: MemberSummary;
  status: "pending" | "accepted" | "declined";
  incoming: boolean;
  unreadCount: number;
  lastMessage: Message | null;
  createdAt: string;
};
export type Notification = {
  id: string;
  kind:
    | "follow"
    | "like"
    | "comment"
    | "message"
    | "request"
    | "verification_request"
    | "verification_verified"
    | "verification_disputed";
  href?: string;
  actor: MemberSummary;
  targetId: string;
  createdAt: string;
  read: boolean;
};
export type ReportTarget = "post" | "comment" | "message" | "member";
export type Report = {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  evidence: unknown;
};
export type ModerationInput = {
  targetType: ReportTarget;
  targetId: string;
  action: "remove" | "restore" | "resolve";
  reason: string;
  reportId?: string;
};
export type FeedQuery = {
  mode?: "following" | "explore";
  cursor?: string | null;
  limit?: number;
  memberId?: string;
};
