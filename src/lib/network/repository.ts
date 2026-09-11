import type {
  Comment,
  Conversation,
  FeedQuery,
  MemberDetail,
  MemberSummary,
  Message,
  ModerationInput,
  NetworkMembership,
  Notification,
  Page,
  Post,
  PostInput,
  Report,
  ReportTarget,
} from "./types";
export interface NetworkRepository {
  canReadMedia(path: string): Promise<boolean>;
  isModerator(): Promise<boolean>;
  getMembership(): Promise<NetworkMembership | null>;
  joinNetwork(dateOfBirth: string): Promise<NetworkMembership>;
  getFeed(query?: FeedQuery): Promise<Page<Post>>;
  getPost(id: string): Promise<Post | null>;
  publishPost(input: PostInput): Promise<Post>;
  updatePost(id: string, input: PostInput): Promise<Post>;
  deletePost(id: string): Promise<void>;
  setLike(postId: string, liked: boolean): Promise<void>;
  getComments(postId: string): Promise<Comment[]>;
  addComment(postId: string, text: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  discover(query?: string): Promise<MemberSummary[]>;
  getMember(handle: string): Promise<MemberDetail | null>;
  setFollow(memberId: string, following: boolean): Promise<void>;
  getBlockedMembers(): Promise<MemberSummary[]>;
  setBlock(memberId: string, blocked: boolean): Promise<void>;
  getConversations(): Promise<Conversation[]>;
  requestConversation(
    memberId: string,
    text: string,
    idempotencyKey: string,
  ): Promise<Conversation>;
  respondConversation(id: string, accept: boolean): Promise<void>;
  getMessages(conversationId: string): Promise<Message[]>;
  sendMessage(
    conversationId: string,
    text: string,
    idempotencyKey: string,
  ): Promise<Message>;
  markConversationRead(id: string): Promise<void>;
  getNotifications(): Promise<Notification[]>;
  markNotificationsRead(): Promise<void>;
  getUnreadCounts(): Promise<{
    messages: number;
    notifications: number;
  }>;
  report(
    targetType: ReportTarget,
    targetId: string,
    reason: string,
  ): Promise<void>;
  getReports(): Promise<Report[]>;
  moderate(input: ModerationInput): Promise<void>;
  deleteAccountData(): Promise<void>;
}
