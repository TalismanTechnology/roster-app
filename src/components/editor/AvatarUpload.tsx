"use client";

import { useRef, useState, useTransition } from "react";

import { removeAvatar, updateAvatar, type FormState } from "@/lib/actions/resume";
import { FormNotice } from "@/components/ui/fields";
import { AVATAR_MAX_BYTES, AVATAR_SIZE_PX } from "@/lib/avatars";

const IDLE: FormState = { ok: false, error: null };

/**
 * Photo upload for the identity section. The browser does the work: the
 * chosen file is centre-cropped to a square, scaled to AVATAR_SIZE_PX, and
 * re-encoded as JPEG before it is sent, so a 12 MP phone photo goes up as
 * ~60 KB and the server only stores what it could have produced itself.
 * EXIF (location included) does not survive the canvas, which matters for
 * a minor's photo as much as the bytes do.
 *
 * The preview is the parent's job: it re-renders with the new avatar_url
 * when the action revalidates the page.
 */
export function AvatarUpload({ hasAvatar }: { hasAvatar: boolean }) {
  const [state, setState] = useState<FormState>(IDLE);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onChoose(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      try {
        const blob = await squareJpeg(file);
        const form = new FormData();
        form.set("avatar", blob, "avatar.jpg");
        setState(await updateAvatar(IDLE, form));
      } catch {
        setState({ ok: false, error: "That file couldn't be read as a photo. Try a JPEG or PNG." });
      } finally {
        // Choosing the same file again should upload again.
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function onRemove() {
    startTransition(async () => setState(await removeAvatar(IDLE, new FormData())));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className={`btn-outline min-h-9 cursor-pointer px-4 text-sm ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <span aria-hidden className="font-mono text-ink-muted">[</span>
        {isPending ? "Saving…" : hasAvatar ? "Replace photo" : "Upload photo"}
        <span aria-hidden className="font-mono text-ink-muted">]</span>
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={isPending}
          onChange={(e) => onChoose(e.currentTarget.files?.[0])}
        />
      </label>
      {hasAvatar && (
        <button type="button" onClick={onRemove} disabled={isPending} className="btn-ghost min-h-9 px-3 text-sm">
          Remove
        </button>
      )}
      <FormNotice ok={state.ok} error={state.error} savedAt={state.savedAt} />
    </div>
  );
}

/**
 * The file as a centre-cropped AVATAR_SIZE_PX square JPEG. Black behind any
 * transparency — the page it lands on is black. Steps quality down if a
 * very detailed photo would still exceed the server's cap.
 */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const edge = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_SIZE_PX, edge);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, size, size);
  bitmap.close();

  for (const quality of [0.85, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("too large");
}
