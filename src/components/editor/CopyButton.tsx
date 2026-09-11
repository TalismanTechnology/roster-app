"use client";
import { useEffect, useRef, useState } from "react";
export function CopyButton({ value, label = "Copy", className = "btn-outline min-h-11 px-3 text-sm" }: { value: string; label?: string; className?: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    const text = value.startsWith("/") ? window.location.origin + value : value;
    try { await navigator.clipboard.writeText(text); setFallback(""); setIsCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setIsCopied(false), 2500); }
    catch { setFallback(text); }
  }
  return <span className="inline-flex max-w-full flex-wrap items-center gap-2"><button type="button" onClick={copy} className={`${className} min-h-11`} aria-live="polite">{isCopied ? "Copied" : label}</button>{fallback && <label className="block w-full text-sm text-ink-muted" role="status">Copy this link manually:<input aria-label="Link to copy manually" className="mt-2 min-h-11 w-full rounded border border-rule bg-paper px-3 text-ink" readOnly value={fallback} onFocus={event => event.currentTarget.select()} /></label>}</span>;
}
