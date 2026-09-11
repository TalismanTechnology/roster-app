"use server";

import { revalidatePath } from "next/cache";
import { getNetworkRepository } from "@/lib/network";
import { DataError } from "@/lib/data/types";
import type { ReportTarget } from "@/lib/network/types";

export type NetworkActionState = { error?: string; success?: string; destination?: string; revision?: number };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function networkAction(_previous: NetworkActionState, form: FormData): Promise<NetworkActionState> {
  const id = value(form, "id");
  const operation = value(form, "operation");
  let destination: string | undefined;
  try {
    const repo = await getNetworkRepository();
    switch (operation) {
      case "join":
        if (form.get("participation") !== "on") return { error: "Accept the community agreement to continue." };
        await repo.joinNetwork(value(form, "dateOfBirth")); destination = "/app"; break;
      case "publish": {
        const post = await repo.publishPost({ text: value(form, "text"), images: form.getAll("images").map(String).filter(Boolean), filmUrl: value(form, "filmUrl") || null });
        destination = `/app/posts/${post.id}`; break;
      }
      case "edit": await repo.updatePost(id, { text: value(form, "text"), images: form.getAll("images").map(String).filter(Boolean), filmUrl: value(form, "filmUrl") || null }); break;
      case "delete": await repo.deletePost(id); destination = "/app"; break;
      case "like": await repo.setLike(id, value(form, "enabled") === "true"); break;
      case "follow": await repo.setFollow(id, value(form, "enabled") === "true"); break;
      case "block": await repo.setBlock(id, value(form, "enabled") === "true"); if (value(form, "enabled") === "true") destination = "/app/messages"; revalidatePath("/settings"); break;
      case "comment": await repo.addComment(id, value(form, "text")); break;
      case "deleteComment": await repo.deleteComment(id); break;
      case "request": { const conversation = await repo.requestConversation(id, value(form, "text"), value(form, "key")); destination = `/app/messages/${conversation.id}`; break; }
      case "respond": await repo.respondConversation(id, value(form, "accept") === "true"); break;
      case "message": await repo.sendMessage(id, value(form, "text"), value(form, "key")); break;
      case "read": await repo.markConversationRead(id); break;
      case "notifications": await repo.markNotificationsRead(); break;
      case "report": await repo.report(value(form, "targetType") as ReportTarget, id, value(form, "reason")); break;
      case "moderate": await repo.moderate({ targetType: value(form, "targetType") as ReportTarget, targetId: id, action: value(form, "decision") as "remove" | "restore" | "resolve", reason: value(form, "reason"), reportId: value(form, "reportId") }); break;
      default: return { error: "This action is unavailable. Refresh the page and try again." };
    }
    revalidatePath("/app", "layout");
    return { success: operation === "report" ? "Report sent for review." : "Saved.", destination, revision: Date.now() };
  } catch (error) {
    return { error: error instanceof DataError ? error.message : "We couldn’t save that. Check your connection and try again." };
  }
}
