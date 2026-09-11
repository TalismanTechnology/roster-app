"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useFormDraft } from "@/components/ui/useFormDraft";

import { checkHandle, completeOnboarding, type FormState } from "@/lib/actions/resume";
import { Field, Select, TextInput } from "@/components/ui/fields";
import { Corner, CORNER, Verified } from "@/components/ui/marks";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEVEL_OPTIONS } from "@/lib/format";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";
import { SPORTS } from "@/lib/sports";

const IDLE: FormState = { ok: false, error: null };

type Availability = "error" | "idle" | "checking" | "available" | "taken" | "invalid";

const STEPS = [
  { n: "01", title: "Claim your handle" },
  { n: "02", title: "Who you are" },
  { n: "03", title: "Who can see it" },
];

/**
 * Three steps, one form. The steps are progressive disclosure, not separate
 * submissions: everything posts once at the end, so a refresh mid-way loses
 * nothing the server would have refused anyway. The handle is checked live
 * against the repository as the athlete types.
 */
export function OnboardingForm({next = "/app"}: {next?: string}) {
  const [state, formAction, pending] = useActionState(completeOnboarding, IDLE);
  const form = useRef<HTMLFormElement>(null);
  const captureDraft = useFormDraft(form, state, pending, Boolean(state.error));
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [kind, setKind] = useState("athlete");
  const [school, setSchool] = useState("");
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState("");
  const [checkedHandle, setCheckedHandle] = useState<{handle: string; retry: number; result: Availability} | null>(null);
  const normalizedHandle = handle.trim().toLowerCase();
  const validHandle = HANDLE_PATTERN.test(normalizedHandle) && !isReservedHandle(normalizedHandle);
  const availability: Availability = !normalizedHandle ? "idle" : !validHandle ? "invalid" :
    checkedHandle?.handle === normalizedHandle && checkedHandle.retry === retry ? checkedHandle.result : "checking";

  // The current input derives idle/invalid/checking immediately; only matching
  // asynchronous responses can update the availability result.
  useEffect(() => {
    if (!validHandle) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkHandle(normalizedHandle);
        if (!cancelled) setCheckedHandle({handle: normalizedHandle, retry, result});
      } catch {
        if (!cancelled) setCheckedHandle({handle: normalizedHandle, retry, result: "error"});
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedHandle, validHandle, retry]);

  const canAdvance = step === 0 ? availability === "available" : step === 1 ? name.trim().length >= 2 && (kind === "athlete" || school.trim().length > 0) : true;

  return (
    <form ref={form} onSubmit={event => captureDraft(event.currentTarget)} onReset={event=>event.preventDefault()} onInvalidCapture={event => {
      event.preventDefault();
      const field = event.target as HTMLInputElement;
      const targetStep = field.closest<HTMLElement>("[data-step]")?.dataset.step;
      if (targetStep !== undefined) setStep(Number(targetStep));
      requestAnimationFrame(() => field.focus());
    }} action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="next" value={next} />
      {/* Progress: the numerals, the current one in ink. */}
      <ol className="flex items-center gap-4" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`font-display text-2xl tracking-tighter transition-colors ${i === step ? "text-ink" : i < step ? "text-ink-muted" : "text-ink-subtle"}`}
              aria-current={i === step ? "step" : undefined}
            >
              {s.n}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-rule" aria-hidden />}
          </li>
        ))}
      </ol>

      <h2 className="font-display text-display leading-none tracking-tight">{STEPS[step].title}</h2>

      {/* Step 01 — handle. Kept mounted at every step so the value posts. */}
      <div data-step="0" className={step === 0 ? "flex flex-col gap-6" : "hidden"}>
        <Field label="Handle" hint="Your resume's address. Lowercase letters, numbers, underscores.">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-ink-subtle">@</span>
            <TextInput
              data-controlled="true"
              name="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
              pattern="[a-z0-9][a-z0-9_]{1,28}[a-z0-9]"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              style={{ paddingLeft: "2.5rem" }}
              aria-describedby="handle-status"
            />
          </div>
        </Field>
        <p id="handle-status" role="status" className="label flex min-h-5 items-center gap-1.5">
          {availability === "error" && <span>Could not check this handle. <button type="button" className="underline" onClick={()=>setRetry(value=>value+1)}>Retry</button></span>}
          {availability === "checking" && <span className="text-ink-muted">Checking…</span>}
          {availability === "available" && (
            <>
              <Verified label="Available" /> <span>@{handle.trim().toLowerCase()} is available.</span>
            </>
          )}
          {availability === "taken" && <span className="text-disputed">That handle is taken.</span>}
          {availability === "invalid" && (
            <span className="text-disputed">3–30 characters, lowercase letters, numbers, underscores. Some words are reserved.</span>
          )}
        </p>
      </div>

      {/* Step 02 — identity */}
      <div data-step="1" className={step === 1 ? "flex flex-col gap-6" : "hidden"}>
        <Field label="Account type"><Select data-controlled="true" name="account_kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="athlete">Athlete</option><option value="coach">Coach</option><option value="recruiter">Recruiter</option></Select></Field>
        <Field label="School or organization"><TextInput data-controlled="true" name="school" value={school} onChange={event=>setSchool(event.target.value)} required={kind !== "athlete"} /></Field>
        <Field label="Your name">
          <TextInput
            data-controlled="true"
            name="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
          />
        </Field>
        <div className={kind === "athlete" ? "grid gap-6 sm:grid-cols-2" : "hidden"}>
          <Field label="Sport">
            <Select disabled={kind !== "athlete"} name="primary_sport" defaultValue="football">
              {SPORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select disabled={kind !== "athlete"} name="level" required={kind === "athlete"} defaultValue="high_school">
              {LEVEL_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {kind === "athlete" && <Field label="Class of" hint="The year you graduate. Recruiters filter on it.">
          <TextInput name="grad_year" type="number" min={1950} max={2100} inputMode="numeric" placeholder="2027" />
        </Field>}
      </div>

      {/* Step 03 — visibility */}
      <div data-step="2" className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
        {(
          [
            ["public", "Public", "In search, open to anyone. This is how you get found."],
            ["unlisted", "Unlisted", "Off search. Anyone you send the link to can open it."],
            ["private", "Private", "Only you, until you flip it."],
          ] as const
        ).map(([value, label, body], i) => (
          <label
            key={value}
            className="relative flex cursor-pointer items-start gap-4 border border-rule p-4 transition-colors has-[:checked]:border-ink"
          >
            <input type="radio" name="visibility" value={value} defaultChecked={i === 0} className="peer sr-only" />
            <span className="mt-1 size-4 shrink-0 rounded-full border border-rule-strong peer-checked:border-[5px] peer-checked:border-ink" aria-hidden />
            <span>
              <span className="block font-bold">{label}</span>
              <span className="label mt-0.5 block text-ink-muted">{body}</span>
            </span>
            {i === 0 && <span className="label absolute top-4 right-4 text-ink-muted">Recommended</span>}
          </label>
        ))}
        <Field label="Date of birth" hint="Private. Used to check eligibility for the network."><TextInput name="date_of_birth" type="date" required /></Field>
        <p className="text-sm leading-relaxed text-ink-muted">Share work you have the right to share, respect other members, and keep personal information private. Harassment, impersonation, and unsafe content are not allowed. You can block members and report content from the app.</p>
        <label className="flex gap-3"><input type="checkbox" name="accept_network" required /> I accept the network rules and agree to join the Roster network.</label>
        <p className="label mt-2 text-ink-muted">You can change this any time from your resume.</p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-rule pt-6">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="btn-ghost -ml-4">
            Back
          </button>
        ) : (
          <span />
        )}

        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep(step + 1)} disabled={!canAdvance} className="btn-primary">
            Continue
          </button>
        ) : (
          <SubmitButton pendingLabel="Creating…">{kind === "athlete" ? "Create my resume" : "Create my profile"}</SubmitButton>
        )}
      </div>

      <p className="label flex items-center gap-2 text-ink-subtle">
        <Corner d={CORNER.bl} /> Everything else — record, film, academics, references — is added from the editor.
      </p>
    </form>
  );
}
