"use client";
import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { MediaUpload } from "@/components/media/MediaUpload";
import type { Post } from "@/lib/network/types";

export function imageSource(path: string) { return path.startsWith("https://") || path.startsWith("/") ? path : `/api/media/${path}`; }
export function Composer({ post, initialText = "" }: { post?: Post; initialText?: string }) {
  const [images, setImages] = useState<string[]>(post?.images ?? []);
  const [photoPending, setPhotoPending] = useState(false);
  const [text, setText] = useState(post?.text ?? initialText);
  const [filmUrl, setFilmUrl] = useState(post?.filmUrl ?? "");
  return <section className="network-panel network-composer" aria-label={post ? "Edit your post" : "Create a post"}>
    <ActionForm operation={post ? "edit" : "publish"} fields={post ? { id: post.id } : {}} label={post ? "Save changes" : "Publish post"} submitDisabled={photoPending}>
      <label className="network-label" htmlFor={post ? `post-${post.id}` : "new-post"}>{post ? "Edit post" : "What’s moving you forward?"}</label>
      <textarea id={post ? `post-${post.id}` : "new-post"} name="text" data-controlled="true" maxLength={2000} rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="A training breakthrough. A game-day moment. Your next goal." />
      {images.length > 0 && <div className="network-upload-grid">{images.map((image, i) => <div key={image}><img src={imageSource(image)} alt={`Attached photo ${i + 1}`} /><input type="hidden" name="images" value={image} /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setImages(images.filter((_, index) => index !== i))}>×</button></div>)}</div>}
      <div className="network-composer-tools"><MediaUpload purpose="post" disabled={images.length >= 4} onBusyChange={setPhotoPending} onUpload={(path: string) => setImages(previous => [...previous, path].slice(0, 4))} /><span className="network-muted">{images.length}/4 photos</span></div>
      {photoPending && <p role="status" className="network-help">Finish adding your photo or cancel it before publishing.</p>}
      <details><summary>Add a film link</summary>{images.length > 0 && <p className="network-help">Remove photos to attach a film link instead.</p>}<label className="network-label">YouTube, Vimeo, or Hudl URL<input name="filmUrl" data-controlled="true" type="url" disabled={images.length > 0} value={filmUrl} onChange={event => setFilmUrl(event.target.value)} placeholder="https://…" /></label></details>
      <p className="network-help">Visible to Roster members. Share work you own and respect others’ privacy.</p>
    </ActionForm>
  </section>;
}
