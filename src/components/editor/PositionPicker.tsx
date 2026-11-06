"use client";

import { useEffect, useRef, useState } from "react";

import { MAX_POSITION_LENGTH, MAX_POSITIONS, normalizePositions, positionsFor } from "@/lib/positions";

/**
 * Positions as chips (#60): the sport's common positions to toggle, and a
 * free-text field for anything else ("Slot", "4x400 anchor"). The value
 * posts as one comma-joined `positions` field, which the action normalizes
 * exactly as before — so a custom position is stored and searched like any
 * other.
 *
 * The chip set follows the form's Sport select as the athlete changes it,
 * before saving; chosen positions are kept across a sport change.
 */
export function PositionPicker({ initial, sport }: { initial: string[]; sport: string | null }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [currentSport, setCurrentSport] = useState(sport);
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // The Sport select lives in the same form; listen rather than lift state
  // out of a Server Component.
  useEffect(() => {
    const select = rootRef.current?.closest("form")?.querySelector<HTMLSelectElement>('select[name="primary_sport"]');
    if (!select) return;
    const onChange = () => setCurrentSport(select.value || null);
    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
  }, []);

  const options = positionsFor(currentSport);
  const isChosen = (p: string) => chosen.some((c) => c.toLowerCase() === p.toLowerCase());
  const full = chosen.length >= MAX_POSITIONS;
  const extras = chosen.filter((c) => !options.some((o) => o.toLowerCase() === c.toLowerCase()));

  function toggle(p: string) {
    setChosen((list) => (isChosen(p) ? list.filter((c) => c.toLowerCase() !== p.toLowerCase()) : normalizePositions([...list, p])));
    markDirty();
  }

  function addCustom() {
    const next = normalizePositions([...chosen, custom]);
    setChosen(next);
    setCustom("");
    markDirty();
  }

  // The EditorForm marks itself unsaved on a native `change`; chip buttons
  // don't fire one, so dispatch it.
  function markDirty() {
    rootRef.current?.closest("form")?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <input type="hidden" name="positions" value={chosen.join(", ")} />
      {options.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Common positions">
          {options.map((p) => (
            <li key={p}>
              <button
                type="button"
                aria-pressed={isChosen(p)}
                disabled={!isChosen(p) && full}
                onClick={() => toggle(p)}
                className={`label min-h-8 border px-2.5 font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isChosen(p) ? "border-ink bg-ink text-paper" : "border-rule-strong text-ink-muted hover:border-ink hover:text-ink"
                }`}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
      {extras.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Your other positions">
          {extras.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => toggle(p)}
                aria-label={`Remove ${p}`}
                className="label min-h-8 border border-ink px-2.5 font-mono text-ink transition-colors hover:border-disputed hover:text-disputed"
              >
                {p} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (custom.trim()) addCustom();
            }
          }}
          maxLength={MAX_POSITION_LENGTH}
          disabled={full}
          placeholder={full ? `${MAX_POSITIONS} positions max` : "Other position"}
          aria-label="Other position"
          className="min-w-0 flex-1 rounded-(--radius-input) border border-rule-strong bg-paper-sunken px-3 py-2 text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none disabled:opacity-50"
        />
        <button type="button" onClick={addCustom} disabled={full || !custom.trim()} className="btn-row disabled:cursor-not-allowed disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}
