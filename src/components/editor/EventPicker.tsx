"use client";

import { useId } from "react";

import { Select } from "@/components/ui/fields";
import type { EventTemplate } from "@/lib/sport-events";

/**
 * #55: the sport's common events. Picking one fills the entry's title and
 * unit in the same form — both stay editable — and the action derives
 * `value_numeric` from the mark in that unit. "Something else" leaves the
 * fields alone. The picker itself posts nothing the server reads.
 */
export function EventPicker({ events, initial }: { events: EventTemplate[]; initial: string }) {
  const id = useId();
  if (events.length === 0) return null;

  function apply(slug: string) {
    const event = events.find((e) => e.slug === slug);
    const form = document.getElementById(id)?.closest("form");
    if (!event || !form) return;
    const title = form.elements.namedItem("title");
    const unit = form.elements.namedItem("unit");
    if (title instanceof HTMLInputElement) title.value = event.name;
    if (unit instanceof HTMLSelectElement) unit.value = event.unit;
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">Event</span>
      <Select id={id} defaultValue={initial} onChange={(e) => apply(e.target.value)} aria-describedby={`${id}-hint`}>
        <option value="">Something else</option>
        {events.map((e) => (
          <option key={e.slug} value={e.slug}>
            {e.name} ({e.unit})
          </option>
        ))}
      </Select>
      <span id={`${id}-hint`} className="mt-2 block text-sm text-ink-muted">
        Fills the title and unit. Type the mark the way your sport writes it.
      </span>
    </label>
  );
}
