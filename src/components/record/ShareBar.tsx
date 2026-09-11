"use client";
import { CopyButton } from "@/components/editor/CopyButton";
export function ShareBar({ handle, print = true }: { handle: string; print?: boolean }) {
 return <div className="print-hidden flex flex-wrap gap-2"><CopyButton value={`/${handle}`} label="Copy link" className="btn-outline min-h-11 px-4 text-sm" />{print && <button type="button" onClick={() => window.print()} className="btn-ghost min-h-11 px-3 text-sm">Print / PDF</button>}</div>;
}
