import { notFound } from "next/navigation";
import Link from "next/link";
import { networkContext } from "@/components/network/server";
import { PostCard, ReportForm } from "@/components/network/PostCard";
import { ActionForm } from "@/components/network/ActionForm";
import { MemberIdentity, Timestamp } from "@/components/network/primitives";
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
 const { user, repo } = await networkContext(); const { id } = await params;
 const post = await repo.getPost(id); if (!post) notFound();
 const comments = await repo.getComments(id);
 return <div className="network-page"><Link className="network-back" href="/app">← Back to feed</Link><PostCard post={post} viewerId={user.id} expanded /><section className="network-panel network-comments"><h1>Conversation <span className="network-muted">{comments.length}</span></h1><ActionForm operation="comment" fields={{ id }} label="Post comment" reset><label className="network-label">Add to the conversation<textarea name="text" required maxLength={1000} rows={2} placeholder="Be encouraging. Be constructive." /></label></ActionForm>{comments.map(comment => <article className="network-comment" key={comment.id}><MemberIdentity member={comment.author} /><p>{comment.text}</p><div className="network-row"><Timestamp value={comment.createdAt} />{comment.author.id === user.id ? <ActionForm quiet operation="deleteComment" fields={{ id: comment.id }} label="Delete" confirm="Delete this comment?" /> : <ReportForm targetType="comment" id={comment.id} />}</div></article>)}</section></div>;
}
