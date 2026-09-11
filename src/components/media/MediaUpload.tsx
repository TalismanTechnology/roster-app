"use client";
import { useEffect, useId, useRef, useState } from "react";

type Purpose = "post" | "avatar" | "cover";
type Crop = { image: HTMLImageElement; url: string; name: string };
const labels: Record<Purpose, string> = { post: "Add photo", avatar: "Change profile photo", cover: "Change cover photo" };

/** Keeps the original in memory until success, so a failed upload can be retried. */
export function MediaUpload({ purpose, onUpload, onBusyChange, disabled = false }: { purpose: Purpose; onUpload: (path: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const restoreFocus = useRef(false);
  const cropPanel = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = progress !== null;
  const aspect = purpose === "avatar" ? 1 : purpose === "cover" ? 3 : crop ? crop.image.naturalWidth / crop.image.naturalHeight : 4 / 3;

  useEffect(() => () => { xhr.current?.abort(); }, []);
  useEffect(() => { onBusyChange?.(Boolean(crop) || loading || busy); }, [crop, loading, busy, onBusyChange]);
  useEffect(() => {
    if (crop) cropPanel.current?.focus();
    else if (restoreFocus.current) { input.current?.focus(); restoreFocus.current = false; }
  }, [crop]);
  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop.url); }, [crop]);
  useEffect(() => {
    if (!crop || !canvas.current) return;
    const target = canvas.current;
    const context = target.getContext("2d");
    if (!context) return;
    const width = crop.image.naturalWidth;
    const height = crop.image.naturalHeight;
    const sourceWidth = Math.min(width, height * aspect) / zoom;
    const sourceHeight = sourceWidth / aspect;
    const outputWidth = Math.min(purpose === "avatar" ? 800 : 1920, sourceWidth);
    target.width = Math.max(1, Math.round(outputWidth));
    target.height = Math.max(1, Math.round(outputWidth / aspect));
    context.drawImage(crop.image, (width - sourceWidth) * horizontal / 100, (height - sourceHeight) * vertical / 100, sourceWidth, sourceHeight, 0, 0, target.width, target.height);
  }, [crop, zoom, horizontal, vertical, purpose, aspect]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.size || file.size > 10 * 1024 * 1024) { setError("Choose a photo smaller than 10 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG, or WebP photo."); return; }
    setLoading(true);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("size");
      setCrop({ image, url, name: file.name }); setZoom(1); setHorizontal(50); setVertical(50);
    } catch {
      URL.revokeObjectURL(url); setError("This image could not be opened. Choose a still photo under 40 megapixels.");
    } finally { setLoading(false); }
  }

  async function upload() {
    if (!canvas.current || busy) return;
    setError(null); setProgress(0);
    const blob = await new Promise<Blob | null>(resolve => canvas.current?.toBlob(resolve, "image/webp", .9));
    if (!blob) { setError("Could not prepare this photo. Choose it again."); setProgress(null); return; }
    const data = new FormData(); data.set("purpose", purpose); data.set("file", blob, "photo.webp");
    const request = new XMLHttpRequest(); xhr.current = request;
    request.open("POST", "/api/media"); request.timeout = 90_000;
    request.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => {
      setProgress(null); xhr.current = null;
      let response: { path?: string; error?: string };
      try { response = JSON.parse(request.responseText); } catch { response = { error: "Upload failed. Please try again." }; }
      if (request.status >= 200 && request.status < 300 && response.path) { onUpload(response.path); restoreFocus.current = true; setCrop(null); if (input.current) input.current.value = ""; }
      else setError(response.error || "Upload failed. Please try again.");
    };
    const fail = () => { setProgress(null); xhr.current = null; setError("Upload interrupted. Your photo is still here—try again when connected."); };
    request.onerror = fail; request.ontimeout = fail;
    request.onabort = () => { setProgress(null); xhr.current = null; };
    request.send(data);
  }

  function cancel() { xhr.current?.abort(); restoreFocus.current = true; setCrop(null); setError(null); }
  return <div className="media-upload">
    {!crop && <label className="media-upload-trigger" style={{ opacity: disabled ? .5 : undefined }}>
      <span aria-hidden="true">＋</span>{loading ? "Opening photo…" : labels[purpose]}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled || loading} aria-label={labels[purpose]} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
    </label>}
    {crop && <div ref={cropPanel} tabIndex={-1} className="media-crop" role="group" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
      <p id={`${id}-title`} className="text-sm font-semibold mb-3">Adjust your {purpose === "avatar" ? "profile photo" : purpose === "cover" ? "cover photo" : "photo"}</p>
      <canvas ref={canvas} role="img" aria-label="Cropped photo preview" />
      <fieldset disabled={busy}>
        <label>Zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <label>Horizontal position<input type="range" min="0" max="100" value={horizontal} onChange={e => setHorizontal(Number(e.target.value))} /></label>
        <label>Vertical position<input type="range" min="0" max="100" value={vertical} onChange={e => setVertical(Number(e.target.value))} /></label>
      </fieldset>
      {busy && <div role="status" className="mt-3 text-sm"><progress max="100" value={progress} aria-label="Photo upload" /> {progress === 100 ? "Processing photo…" : `Uploading ${progress}%`}</div>}
      <div className="flex flex-wrap gap-3 mt-4"><button className="btn-primary" type="button" disabled={busy} onClick={() => void upload()}>{busy ? "Uploading…" : error ? "Retry upload" : "Use photo"}</button><button className="btn-row" type="button" onClick={cancel}>Cancel</button></div>
    </div>}
    {error && <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>}
  </div>;
}
