"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfilePhoto } from "@/lib/actions/media";
import { MediaUpload } from "./MediaUpload";

export function ProfileMedia({ avatarUrl, coverUrl }: { avatarUrl: string | null; coverUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ purpose: "avatar" | "cover"; path: string | null } | null>(null);
  function save(purpose: "avatar" | "cover", path: string | null) {
    setError(null); setStatus(null);
    startTransition(async () => {
      try {
        const result = await saveProfilePhoto(purpose, path);
        if (result.error) { setError(result.error); setRetry({ purpose, path }); return; }
        setRetry(null); setStatus(path ? "Photo saved." : "Photo removed."); router.refresh();
      } catch { setError("Photo could not be saved. Try again."); setRetry({ purpose, path }); }
    });
  }
  return <section className="mb-8 border-b border-rule pb-8" aria-labelledby="profile-media-title">
    <h3 id="profile-media-title" className="text-sm font-semibold mb-4">Profile photos</h3>
    <div className="grid gap-5 sm:grid-cols-[130px_1fr]">
      <div>{avatarUrl ? <img src={avatarUrl} alt="Your profile photo" className="w-24 h-24 rounded-full object-cover mb-3" /> : <div className="w-24 h-24 rounded-full bg-paper-sunken border border-rule mb-3 grid place-items-center text-ink-muted text-sm">No photo</div>}
        <MediaUpload purpose="avatar" disabled={pending} onUpload={path => save("avatar", path)} />
        {avatarUrl && <button type="button" disabled={pending} className="btn-row mt-2" onClick={() => save("avatar", null)}>Remove photo</button>}
      </div>
      <div>{coverUrl ? <img src={coverUrl} alt="Your cover photo" className="w-full aspect-[3/1] rounded-lg object-cover mb-3" /> : <div className="w-full aspect-[3/1] rounded-lg border border-rule bg-paper-sunken mb-3 grid place-items-center text-sm text-ink-muted">Add a cover that represents you</div>}
        <MediaUpload purpose="cover" disabled={pending} onUpload={path => save("cover", path)} />
        {coverUrl && <button type="button" disabled={pending} className="btn-row mt-2" onClick={() => save("cover", null)}>Remove cover</button>}
      </div>
    </div>
    <p className="text-xs text-ink-muted mt-3">JPEG, PNG, or WebP · up to 10 MB. Your profile photo appears beside your posts. Resume photos follow your resume visibility.</p>
    {pending && <p role="status" className="text-sm mt-3">Saving photo…</p>}
    {status && <p role="status" className="text-sm mt-3">{status}</p>}
    {error && <div role="alert" className="text-sm mt-3 text-red-300">{error} {retry && <button disabled={pending} type="button" className="underline" onClick={() => save(retry.purpose, retry.path)}>Retry save</button>}</div>}
  </section>;
}
