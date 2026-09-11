import Link from "next/link";
import type { Post } from "@/lib/network/types";
import { MemberIdentity, Timestamp } from "./primitives";
import { ActionForm } from "./ActionForm";
import { Composer } from "./Composer";

const source = (path: string) => path.startsWith("https://") || path.startsWith("/") ? path : `/api/media/${path}`;
export function ReportForm({ targetType, id }: { targetType: string; id: string }) {
  return <details className="network-report"><summary>Report</summary><ActionForm operation="report" fields={{ id, targetType }} label="Send report"><label className="network-label">What should we review?<textarea name="reason" required minLength={5} maxLength={1000} rows={2} placeholder="Tell us what happened." /></label></ActionForm></details>;
}
export function PostCard({ post, viewerId, expanded = false }: { post: Post; viewerId: string; expanded?: boolean }) {
  return <article className="network-post network-panel">
    <div className="network-post-header"><MemberIdentity member={post.author} /><Link aria-label="Open post" href={`/app/posts/${post.id}`}><Timestamp value={post.createdAt} /></Link></div>
    {post.text && <p className="network-post-text">{post.text}</p>}
    {post.images.length > 0 && <div className={`network-post-images network-images-${post.images.length}`}>{post.images.map((image, i) => <a key={image} href={source(image)} target="_blank" rel="noopener noreferrer"><img src={source(image)} alt={`Photo ${i + 1} shared by ${post.author.name}`} loading="lazy" /></a>)}</div>}
    {post.filmUrl && <a className="network-film" href={post.filmUrl} target="_blank" rel="noopener noreferrer"><span aria-hidden>▶</span><span><strong>Watch the film</strong><small>Opens external video ↗</small></span></a>}
    <div className="network-post-actions"><ActionForm quiet operation="like" fields={{ id: post.id, enabled: String(!post.liked) }} label={`${post.liked ? "♥ Liked" : "♡ Like"} · ${post.likeCount}`} /><Link className="network-button-quiet" href={`/app/posts/${post.id}`}>Comment · {post.commentCount}</Link><ReportForm targetType="post" id={post.id} /></div>
    {viewerId === post.author.id && <details className="network-post-manage"><summary>Manage your post</summary><Composer post={post} /><ActionForm quiet operation="delete" fields={{ id: post.id }} label="Delete post" confirm="Delete this post and its comments? This cannot be undone." /></details>}
    {!expanded && post.commentCount > 0 && <Link className="network-muted network-comment-link" href={`/app/posts/${post.id}`}>View the conversation →</Link>}
  </article>;
}
