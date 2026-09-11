"use client";

import { useState } from "react";
import type { AchievementKind, RecordEntry } from "@/lib/database.types";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { KIND_OPTIONS } from "@/lib/format";

type EntryGuide = { title: string; mark?: string; competition?: string; placement?: boolean };
const GUIDES: Record<AchievementKind, EntryGuide> = {
  personal_record: { title: "400m Personal Best, New Squat PR", mark: "Your time, distance, weight, or sport-specific mark.", competition: "Meet or event, if this happened in competition." },
  result: { title: "State Championship Final, Regional Meet", mark: "The result as your sport records it: 53.94, 6–2, 24 points.", competition: "The name of the meet, tournament, or game.", placement: true },
  award: { title: "All-Conference First Team, Team MVP", competition: "The league, organization, or event that gave the award." },
  record: { title: "School 100m Record, Season Scoring Record", mark: "The record-setting time, distance, score, or total.", competition: "Meet, league, or event associated with the record." },
  captaincy: { title: "Varsity Team Captain, Club Co-Captain" },
  commitment: { title: "Committed to Central University" },
  selection: { title: "Selected for the Regional Team", competition: "The team, camp, or organization that selected you." },
  milestone: { title: "100 Career Goals, First Varsity Start", mark: "An optional number or mark that captures the milestone." },
};

export function EntryFields({ entry }: { entry?: RecordEntry }) {
  const [kind, setKind] = useState<AchievementKind>(entry?.kind ?? "personal_record");
  const [mark, setMark] = useState(entry?.value_display ?? "");
  const [competition, setCompetition] = useState(entry?.competition ?? "");
  const [placement, setPlacement] = useState(String(entry?.placement ?? ""));
  const [fieldSize, setFieldSize] = useState(String(entry?.field_size ?? ""));
  const guide = GUIDES[kind];
  // Keep drafts when switching types, but only submit inapplicable fields for
  // legacy entries that still have their original type.
  const retained = (value: string | number | null | undefined) => entry && kind === entry.kind ? value ?? "" : "";
  return <>
    <div className="grid gap-6 sm:grid-cols-2">
      <Field label="Type"><Select name="kind" data-controlled="true" value={kind} onChange={event => setKind(event.target.value as AchievementKind)} required>{KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Date"><TextInput name="achieved_on" type="date" defaultValue={entry?.achieved_on ?? ""} required /></Field>
    </div>
    <Field label="Title" hint={guide.title}><TextInput name="title" defaultValue={entry?.title ?? ""} placeholder={guide.title.split(",")[0]} required minLength={3} maxLength={120} /></Field>
    {guide.mark ? <Field label="Mark" hint={guide.mark}><TextInput name="value_display" data-controlled="true" value={mark} onChange={event => setMark(event.target.value)} maxLength={20} /></Field> : <input type="hidden" name="value_display" value={retained(entry?.value_display)} />}
    <details className="rounded-lg border border-rule p-4" open={Boolean(entry && (entry.competition || entry.placement || entry.field_size || entry.location || entry.detail))}>
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">Optional details</summary>
      <div className="mt-4 flex flex-col gap-5">
        {guide.competition ? <Field label="Competition" hint={guide.competition}><TextInput name="competition" data-controlled="true" value={competition} onChange={event => setCompetition(event.target.value)} maxLength={120} /></Field> : <input type="hidden" name="competition" value={retained(entry?.competition)} />}
        {guide.placement ? <div className="grid gap-5 sm:grid-cols-2"><Field label="Placement"><TextInput name="placement" data-controlled="true" type="number" min={1} value={placement} onChange={event => setPlacement(event.target.value)} /></Field><Field label="Field size" hint="Out of how many"><TextInput name="field_size" data-controlled="true" type="number" min={1} value={fieldSize} onChange={event => setFieldSize(event.target.value)} /></Field></div> : <><input type="hidden" name="placement" value={retained(entry?.placement)} /><input type="hidden" name="field_size" value={retained(entry?.field_size)} /></>}
        <Field label="Location"><TextInput name="location" defaultValue={entry?.location ?? ""} maxLength={120} /></Field>
        <Field label="Detail" hint="Add context: your role, the season, or why this achievement matters."><TextArea name="detail" defaultValue={entry?.detail ?? ""} maxLength={500} rows={2} /></Field>
      </div>
    </details>
  </>;
}
