import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { DataError } from "@/lib/data/types";
import type { NetworkRepository } from "./repository";
import type {
  FeedQuery,
  ModerationInput,
  PostInput,
  ReportTarget,
} from "./types";
type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
type NetworkDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      network_api: {
        Args: {
          operation: string;
          payload: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
export class SupabaseNetworkRepository implements NetworkRepository {
  private constructor(
    private readonly client: SupabaseClient<NetworkDatabase>,
  ) {}
  static async create() {
    const jar = await cookies();
    return new SupabaseNetworkRepository(
      createServerClient<NetworkDatabase>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => jar.getAll(),
            setAll: (values) => {
              try {
                for (const value of values)
                  jar.set(value.name, value.value, value.options);
              } catch {
                /* Server Component refresh is handled by the proxy. */
              }
            },
          },
        },
      ),
    );
  }
  private async call<K extends keyof NetworkRepository>(
    operation: K,
    payload: Json = {},
  ): Promise<Awaited<ReturnType<NetworkRepository[K]>>> {
    const { data, error } = await this.client.rpc("network_api", {
      operation,
      payload,
    });
    if (error)
      throw new DataError(
        error.code === "42501"
          ? "forbidden"
          : error.code === "23505"
            ? "conflict"
            : error.code === "22023"
              ? "invalid"
              : "unavailable",
        error.message,
      );
    return data as Awaited<ReturnType<NetworkRepository[K]>>;
  }
  canReadMedia(path: string) {
    return this.call("canReadMedia", { path });
  }
  isModerator() {
    return this.call("isModerator");
  }
  getMembership() {
    return this.call("getMembership");
  }
  joinNetwork(dateOfBirth: string) {
    return this.call("joinNetwork", { dateOfBirth });
  }
  getFeed(query: FeedQuery = {}) {
    return this.call("getFeed", { ...query });
  }
  getPost(id: string) {
    return this.call("getPost", { id });
  }
  publishPost(input: PostInput) {
    return this.call("publishPost", { ...input });
  }
  updatePost(id: string, input: PostInput) {
    return this.call("updatePost", { id, ...input });
  }
  deletePost(id: string) {
    return this.call("deletePost", { id });
  }
  setLike(postId: string, liked: boolean) {
    return this.call("setLike", { postId, liked });
  }
  getComments(postId: string) {
    return this.call("getComments", { postId });
  }
  addComment(postId: string, text: string) {
    return this.call("addComment", { postId, text });
  }
  deleteComment(id: string) {
    return this.call("deleteComment", { id });
  }
  discover(query = "") {
    return this.call("discover", { query });
  }
  getMember(handle: string) {
    return this.call("getMember", { handle });
  }
  setFollow(memberId: string, following: boolean) {
    return this.call("setFollow", { memberId, following });
  }
  getBlockedMembers() {
    return this.call("getBlockedMembers");
  }
  setBlock(memberId: string, blocked: boolean) {
    return this.call("setBlock", { memberId, blocked });
  }
  getConversations() {
    return this.call("getConversations");
  }
  requestConversation(memberId: string, text: string, idempotencyKey: string) {
    return this.call("requestConversation", { memberId, text, idempotencyKey });
  }
  respondConversation(id: string, accept: boolean) {
    return this.call("respondConversation", { id, accept });
  }
  getMessages(conversationId: string) {
    return this.call("getMessages", { conversationId });
  }
  sendMessage(conversationId: string, text: string, idempotencyKey: string) {
    return this.call("sendMessage", { conversationId, text, idempotencyKey });
  }
  markConversationRead(id: string) {
    return this.call("markConversationRead", { id });
  }
  getNotifications() {
    return this.call("getNotifications");
  }
  markNotificationsRead() {
    return this.call("markNotificationsRead");
  }
  getUnreadCounts() {
    return this.call("getUnreadCounts");
  }
  report(targetType: ReportTarget, targetId: string, reason: string) {
    return this.call("report", { targetType, targetId, reason });
  }
  getReports() {
    return this.call("getReports");
  }
  moderate(input: ModerationInput) {
    return this.call("moderate", { ...input });
  }
  deleteAccountData() {
    return this.call("deleteAccountData");
  }
}
