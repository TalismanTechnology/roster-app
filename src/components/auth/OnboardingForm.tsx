"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { checkHandle, completeOnboarding, type FormState } from "@/lib/actions/resume";
import { Field, FieldError, FieldErrors, Select, TextInput } from "@/components/ui/fields";
import { Corner, CORNER, Verified } from "@/components/ui/marks";
import { restoreFormValues } from "@/components/ui/restore-form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEVEL_OPTIONS } from "@/lib/format";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";
import { siteHost } from "@/lib/site";
import { SPORTS } from "@/lib/sports";

const IDLE: FormState = { ok: false, error: null };

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "rate_limited";

const STEPS = [
  { n: "01", title: "Claim your handle", fields: ["handle"] },
  { n: "02", title: "Who you are", fields: ["display_name", "primary_sport", "level", "grad_year"] },
  { n: "03", title: "Who can see it", fields: ["visibility"] },
];

/** The earliest step holding a field the server refused, or null. */
function stepWithError(fieldErrors: FormState["fieldErrors"]): number | null {
  if (!fieldErrors) return null;
  const i = STEPS.findIndex((s) => s.fields.some((f) => fieldErrors[f]?.length));
  return i === -1 ? null : i;
}

/**
 * Three steps, one form. The steps are progressive disclosure, not separate
 * submissions: everything posts once at the end, so a refresh mid-way loses
 * nothing the server would have refused anyway. The handle is checked live
 * against the repository as the athlete types.
 *
 * Keyboard and screen reader: Enter in a field advances when the step is
 * complete (it never submits early); each step change moves focus to the new
 * step's heading; finished steps are buttons back; and a disabled Continue
 * says why, in text it is described by.
 */
export function OnboardingForm() {
  const host = siteHost();
  const [state, formAction] = useActionState(completeOnboarding, IDLE);
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [, startCheck] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);

  // A refused submit lands on the step holding the first refused field —
  // adjusted while rendering, the documented way to follow a prop.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const errorStep = stepWithError(state.fieldErrors);
    if (errorStep !== null) setStep(errorStep);
  }

  // React resets the form after the action; put back the uncontrolled fields.
  useEffect(() => {
    if (state.error && state.values && formRef.current) restoreFormValues(formRef.current, state.values);
  }, [state]);

  // Focus follows the step to its heading, so the change is announced. Not
  // on first paint: the handle field has autofocus there.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  // Debounced live availability. Local validation first so the common
  // typos never hit the server. The synchronous writes are the effect's
  // whole point: availability is state that follows `handle`.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = handle.trim().toLowerCase();
    if (h === "") {
      setAvailability("idle");
      return;
    }
    if (!HANDLE_PATTERN.test(h) || isReservedHandle(h)) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    const t = setTimeout(() => {
      startCheck(async () => {
        const result = await checkHandle(h);
        setAvailability(result);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [handle]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasName = name.trim().length >= 2;
  const canAdvance = step === 0 ? availability === "available" : step === 1 ? hasName && sport !== "" : true;

  // Why Continue is off, in words — shown beside it and linked to it.
  const blockedBecause = canAdvance
    ? null
    : step === 0
      ? availability === "checking"
        ? "Checking that handle…"
        : availability === "idle"
          ? "Choose a handle to continue."
          : "Choose an available handle to continue."
      : !hasName && sport === ""
        ? "Enter your name and pick a sport to continue."
        : !hasName
          ? "Enter your name to continue."
          : "Pick a sport to continue.";

  function advance() {
    if (canAdvance && step < STEPS.length - 1) setStep(step + 1);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-8"
      onKeyDown={(e) => {
        // Enter in a text field means "next", never "submit" before the last step.
        const t = e.target;
        if (e.key !== "Enter" || e.nativeEvent.isComposing || step === STEPS.length - 1) return;
        if (!(t instanceof HTMLInputElement) || t.type === "radio" || t.type === "checkbox") return;
        e.preventDefault();
        advance();
      }}
    >
      {/* Progress: the numerals, the current one in ink. Finished steps are
          buttons back; steps ahead open only through Continue. */}
      <ol className="flex items-center gap-4" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={`font-display text-2xl tracking-tighter transition-colors disabled:cursor-default ${
                i === step ? "cursor-default text-ink" : i < step ? "cursor-pointer text-ink-muted hover:text-ink" : "text-ink-subtle"
              }`}
            >
              <span aria-hidden>{s.n}</span>
              <span className="sr-only">
                Step {i + 1} of {STEPS.length}: {s.title}
                {i < step ? " (done)" : ""}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-rule" aria-hidden />}
          </li>
        ))}
      </ol>

      <h2 ref={headingRef} tabIndex={-1} className="font-display text-display leading-none tracking-tight">
        {STEPS[step].title}
      </h2>

      <FieldErrors errors={state.fieldErrors}>
        {/* Step 01 — handle. Kept mounted at every step so the value posts. */}
        <div className={step === 0 ? "flex flex-col gap-6" : "hidden"}>
          <Field label="Handle" hint="Your resume's address. Lowercase letters, numbers, underscores.">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-ink-subtle">{host}/</span>
              <TextInput
                name="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
                pattern="[a-z0-9][a-z0-9_]{1,28}[a-z0-9]"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                // The prefix is absolutely positioned; reserve roughly its width
                // (6.1rem for "roster.us/") whatever the configured host is.
                style={{ paddingLeft: `${(0.61 * (host.length + 1)).toFixed(2)}rem` }}
                aria-describedby="handle-status"
                // The prefix sits over the input; a server refusal prints below the status line.
                externalError
              />
            </div>
          </Field>
          <p id="handle-status" role="status" className="label flex min-h-5 items-center gap-1.5">
            {availability === "checking" && <span className="text-ink-muted">Checking…</span>}
            {availability === "available" && (
              <>
                <Verified /> <span>{host}/{handle.trim().toLowerCase()} is yours.</span>
              </>
            )}
            {availability === "taken" && <span className="text-disputed">That handle is taken.</span>}
            {availability === "rate_limited" && (
              <span className="text-ink-muted">Too many checks at once — pause a moment, then keep typing.</span>
            )}
            {availability === "invalid" && (
              <span className="text-disputed">3–30 characters, lowercase letters, numbers, underscores. Some words are reserved.</span>
            )}
          </p>
          <FieldError name="handle" />
        </div>

        {/* Step 02 — identity */}
        <div className={step === 1 ? "flex flex-col gap-6" : "hidden"}>
          <Field label="Your name">
            <TextInput
              name="display_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Sport">
              <Select name="primary_sport" value={sport} onChange={(e) => setSport(e.target.value)} required>
                <option value="">Pick a sport</option>
                {SPORTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Level">
              <Select name="level" required defaultValue="high_school">
                {LEVEL_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Class of" hint="The year you graduate. Recruiters filter on it.">
            <TextInput name="grad_year" type="number" min={1950} max={2100} inputMode="numeric" placeholder="2027" />
          </Field>
        </div>

        {/* Step 03 — visibility */}
        <div className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
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
          <p className="label mt-2 text-ink-muted">You can change this any time from your resume.</p>
        </div>
      </FieldErrors>

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
          <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {blockedBecause && (
              <span id="continue-reason" className="label text-ink-muted">
                {blockedBecause}
              </span>
            )}
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              aria-describedby={blockedBecause ? "continue-reason" : undefined}
              className="btn-primary"
            >
              Continue
            </button>
          </span>
        ) : (
          <SubmitButton pendingLabel="Creating…">Create my resume</SubmitButton>
        )}
      </div>

      <p className="label flex items-center gap-2 text-ink-subtle">
        <Corner d={CORNER.bl} /> Everything else — record, film, academics, references — is added from the editor.
      </p>
    </form>
  );
}
