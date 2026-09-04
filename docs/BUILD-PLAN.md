# Roster — full build on the dark identity

Overnight, unattended, ~10 hours. This file is the source of truth for the run:
**after any context reset, read this file first, find the first unchecked box,
and continue from there.** Update the boxes as work lands. Never skip the
verification protocol before a commit.

---

## 0. Locked decisions (do not relitigate)

| Decision | Choice |
|---|---|
| Backend | Supabase is unreachable. Build a **repository interface** with a **file-backed local adapter** (`.data/roster.json`, local signed session cookie). The Supabase adapter is kept compiling but is *untested tonight*. |
| Git | Branch `feat/dark-identity`. One conventional commit per milestone. **Never push.** |
| Theme | **Dark-only.** The landing hero's identity is the app's identity. Light tokens removed. |
| Numbers | No invented user counts, pricing, or claims about competitors. Sample data is fictional and labeled. |
| Schema | `supabase/migrations/*.sql` is **read-only** tonight — the local adapter mirrors its rules; it doesn't change them. |
| Dependencies | `motion` allowed on the landing page only (dynamic import). App routes stay CSS-only for motion. Nothing else new without a one-line justification in the commit. |
| Source of design | `~/lgpsm-dark` (Vite prototype) is the reference. Port, don't reinvent. |

Permissions live in `.claude/settings.local.json` (npm/npx/node, git except push, curl localhost, sips, rm scoped to `src/` and `.data/`).

---

## 1. Design language (port from `~/lgpsm-dark`)

**Canvas** — paper `#000`, raised `#16181c`, sunken `#202327`. Ink `#e7e9ea`, muted `#71767b`, subtle `#5b6167`. Rules are 1px `paper-sunken`.

**Type** — Chirp fallback stack (system sans), no webfonts. Hierarchy = weight (400/700/800) and tightness. `font-display` = 800 / −0.01em. Sentence case everywhere; never uppercase. Tabular figures on every measurement.

**Marks** — `Corner` (4 bracket paths), `Frame` (four corners around a block — *this replaces the card*), `Checker` (the 5×4 stagger), `Globe` (wireframe), `Verified` (ink disc + check). Brackets and hairlines, not borders and radii. The only rounded things are pills for chips/tags and `rounded-md` on buttons.

**Surfaces** — no filled cards as decoration. Content sits on paper with hairlines; `Frame` when a block needs to be a unit; `bg-paper-raised/60` only for interactive tiles. Depth comes from overlap, shadow (`0 48px 96px -24px rgb(0 0 0/.9)`), and translateZ, not from borders.

**Buttons** — `rounded-md`: outline (border `ink-muted` → fills ink on hover), primary (ink fill, paper text), ghost (muted text). Arrow-up-right icon nudges on hover.

**Motion** — CSS-only inside the app: `.reveal` fade-up on scroll (IntersectionObserver), `.hero-word` rise, spotlight hover (CSS radial via `--x/--y` custom props). Landing keeps Tilt / ScrollVelocity / Magnet (motion, dynamic). Everything respects `prefers-reduced-motion`.

**Imagery** — the ten photos in `~/lgpsm-dark/public/img` + `bg-base/bg-reveal`. Copy to `roster/public/img`. Auth pages, empty states, and the verification page use them at low opacity under gradients.

**Semantic colour** — monochrome, with exactly two exceptions: pending (`#ffd400` at 12% wash) and disputed (`#f4212e` at 10% wash). Verified is *ink*, not blue. Focus ring is ink.

**Fluid sizing** — the `--pad-x`, `--headline`, `--body`, `--micro`, `--section-py` clamps from the prototype become app-wide tokens.

---

## 2. Architecture

```
src/lib/data/
├── repository.ts        # the interface every page/action uses
├── index.ts             # getRepository(): local when Supabase unconfigured
├── local/
│   ├── store.ts         # .data/roster.json — atomic write, mtime cache
│   ├── session.ts       # HMAC-signed cookie; secret from ROSTER_SESSION_SECRET or .data/secret
│   ├── auth.ts          # scrypt password hashing, sign in/up/out
│   ├── rules.ts         # RLS mirrored in TS: visibility, ownership, who may verify
│   ├── repository.ts    # LocalRepository implements Repository
│   └── seed.ts          # fixtures → first-run database (athletes across 4 sports, 1 coach, 1 recruiter)
├── supabase/
│   └── repository.ts    # SupabaseRepository — moved from actions/pages, compiles, untested
└── __tests__/           # node:test — rules.test.ts, local-repository.test.ts, session.test.ts
```

**Repository interface** (methods, all async, all return plain data or `{ error }`):
- auth: `signUp(email, password)`, `signIn`, `signOut`, `currentUser()`
- profiles: `getProfileByHandle(handle, viewer)`, `getProfileById`, `createProfile`, `updateProfile(id, patch, actor)`, `isHandleAvailable`
- record: `listEntries(profileId, viewer)`, `addEntry`, `updateEntry`, `deleteEntry`, `setPinned`
- film: `listFilm`, `addFilm`, `deleteFilm`, `featureFilm`
- coaches: `listCoaches(profileId, viewer)`, `addCoach`, `deleteCoach`
- verification: `requestVerification(entryId, coachContactId)` → token, `getVerificationRequest(token)`, `respondToVerification(token, outcome, note, verifierName)`, `listRequests(profileId)`
- signals: `recordView(profileId, viewerId?)`, `weeklyViews(profileId)`
- search: `searchAthletes({ q, sport, level, gradYear, region, gpaMin, page })`
- lists: `listLists(ownerId)`, `createList`, `addToList`, `removeFromList`, `getList`

**Visibility rules (mirror of 0006_security.sql), enforced in `rules.ts`:**
- public: anyone; listed in search
- unlisted: anyone with the link; never in search
- private: owner only (others get not-found, not forbidden — don't confirm existence)
- coach contact details: only when `visibility=public && is_recruitable`
- evidence: owner only
- an athlete cannot verify their own entry; a verifier must be the coach contact the request was sent to
- reserved handles refused (`src/lib/handles.ts`)

**Session** — `roster_session=<userId>.<hmac>`; `httpOnly`, `sameSite=lax`, `secure` in prod. `proxy.ts` gates `/resume`, `/settings`, `/onboarding`, `/lists` by verifying the signature (no network).

**Server Actions** — keep the existing zod schemas; swap `supabase.from(...)` for repository calls. Same `FormState` contract, same error copy.

---

## 3. Surfaces

Every route: dark identity, fluid tokens, `Frame`/hairlines, real empty/loading/error states, keyboard-reachable, `prefers-reduced-motion` honoured, no horizontal overflow at 320.

| Route | What it is | Done when |
|---|---|---|
| `/` | Landing, ported from the prototype. Signed-in: header CTA becomes "Your resume". | Pixel-faithful to prototype at 1440/390; Lighthouse-clean images; CTAs route to `/sign-up`, `/search`. |
| `/sign-in`, `/sign-up` | Split layout: form in a `Frame` left, tunnel/coach photo right under gradient. | Local auth works; errors inline; `?next=` honoured; Enter submits. |
| `/onboarding` | Three steps with 01/02/03 numerals: handle (live availability), identity (name, sport, level, class year), visibility. | Creates profile; reserved/taken handle refused with copy; lands on `/resume`. |
| `/resume` | The editor. Left rail (Identity · Record · Film · Academics · References · Visibility · Requests), main column of forms, right column = **live preview** of the public resume. Share bar: link, copy, view count, verified count. | Every action round-trips; preview updates; optimistic pending states; toasts. |
| `/[handle]` | The public resume — the product. Identity band, verified count, pinned entries, record table (marks, dates, competition), film player, academics, references (gated), "verified by" attribution. `noindex` for unlisted; not-found for private. OG metadata. Print stylesheet. | Renders seeded athletes; gating verified by test; prints to one clean page. |
| `/preview` | Fixtures, no DB — restyled, same components as `/[handle]`. | Identical rendering path. |
| `/search` | Filters in URL (sport, level, class year, state, GPA≥, q). Results like the landing mock. Empty state. Pagination. Recruiters: "add to list". | Public profiles only; unlisted/private never appear (tested). |
| `/verify/[token]` | Coach verification. No account needed: token from the athlete's request → entry + evidence → Verify / Dispute + note + name/role. Applies the mark; athlete sees it in Requests. | Self-verification impossible; token single-use; expired token has copy. |
| `/lists`, `/lists/[id]` | Recruiter lists. Create, add from search, remove, notes. | Owner-only; works from search. |
| `/settings` | Email, password, visibility + recruitable, danger zone (delete), sign out. | All actions round-trip. |
| Shell | Signed-out header (landing's). Signed-in: logo · Your resume · Search · Lists · account menu. Footer shared. | Sticky, transparent over heroes, glass elsewhere. |
| System | `not-found.tsx`, `error.tsx`, `loading.tsx` (skeletons in the identity), `robots.ts`, `sitemap.ts` (public handles), `manifest`. | Present and styled. |

---

## 4. Milestones (≈10h)

Each milestone ends with the **verification protocol** (§5) and a commit.

- [x] **M0 · Foundation (0:30)** — `globals.css` rewritten to the identity (tokens, utilities, fluid vars, motion, print base). `src/components/ui/marks.tsx`, `Button.tsx`, `fields.tsx` restyled, `Img.tsx` + `public/img/*` ported. `layout.tsx` dark-only, metadata. Build green. `feat(design): adopt the dark hero identity as the app's design system`
- [x] **M1 · Data layer (1:30)** — repository interface, local adapter, session, rules, seed (≥12 athletes across football/track/basketball/soccer, 1 coach, 1 recruiter), Supabase adapter moved, actions + pages rewired, `proxy.ts` local gating, `node:test` suite for rules/session/repository (target: the 28 schema checks that apply). `npm run test` script. `feat(data): repository interface with a local file-backed adapter`
- [ ] **M2 · Landing + shell + auth (0:45)** — port `landing/*` + `bits/*` from the prototype (next/link, next/image, `"use client"` where needed, dynamic-import motion). Signed-in/out header + footer. `/sign-in`, `/sign-up`. `feat(landing): port the dark landing and rebuild auth on it`
- [ ] **M3 · Onboarding (0:45)** — three-step flow with live handle check. `feat(onboarding): three-step claim flow`
- [ ] **M4 · Public resume (1:30)** — `/[handle]` + `/preview` on shared `record/*` components; gating, metadata, print CSS. `feat(resume): the public resume on the dark identity`
- [ ] **M5 · Editor (1:30)** — `/resume` with rail, forms, live preview, share bar, requests inbox. `feat(editor): resume editor with live preview`
- [ ] **M6 · Search (0:45)** — filters, results, empty state, pagination, add-to-list. `feat(search): discovery with URL-backed filters`
- [ ] **M7 · Verification (1:00)** — request from editor → `/verify/[token]` → mark applied → inbox. `feat(verify): coach verification by link`
- [ ] **M8 · Settings + lists (0:30)** — `/settings`, `/lists`. `feat(account): settings and recruiter lists`
- [ ] **M9 · Perfect (1:00)** — every route shot at 320/375/768/1024/1440 via `scripts/shots.mjs`; overflow = 0; a11y pass (labels, focus order, contrast ≥ 4.5, reduced motion); perf pass (image dims, lazy, bundle report); copy pass (sentence case, no lorem, no shouting); empty/error/loading states everywhere. `polish: cross-breakpoint, accessibility, and performance pass`
- [ ] **M10 · E2E + report (0:30)** — `scripts/e2e.mjs`: sign up → onboarding → add entry → add film → publish → search finds → request verification → coach verifies → mark visible → recruiter lists. README updated (local mode, scripts). `docs/OVERNIGHT-REPORT.md`: what shipped, screenshots, known gaps, what needs Supabase. `test(e2e): full loop against the local adapter` / `docs: overnight report`

Stretch, only if M0–M10 are green: `opengraph-image` per handle; keyboard shortcut `/` on search; evidence upload (local file store); coach endorsements.

---

## 5. Verification protocol (before every commit)

1. `npm run typecheck` — zero errors.
2. `npm run build` — zero errors, zero warnings I introduced.
3. Dev server on :3000 (`npm run dev` in background; `curl -s -o /dev/null http://localhost:3000/`).
4. `node scripts/shots.mjs <route>` for every route touched; **read the screenshots**; fix what's wrong before moving on.
5. `npm run test` — green.
6. `git add -A && git commit` with the milestone's message + `Co-Authored-By` trailer.
7. Tick the box in this file (in the same commit).

If the dev server wedges: `pkill -f "next dev"`, `rm -rf .next`, restart.

---

## 6. Rules of engagement

- Read `node_modules/next/dist/docs/01-app/...` before using any Next API I'm not certain about (AGENTS.md). Known: `middleware.ts` → `proxy.ts`; `LayoutProps<"/">`; `params`/`searchParams` are Promises.
- Files ≤ 400 lines; split by feature. Match the repo's comment voice (explanatory, why-not-what).
- No `console.log`. No `any`. No new dependency without justification.
- Every Server Action re-validates with zod and checks the session; the repository re-checks ownership.
- Keep `/preview` and `/[handle]` on one rendering path — never two resume renderers.
- Never modify `supabase/migrations`. Never write to `.env.local`.
- If something is ambiguous, pick the option closest to the prototype and note it in `docs/OVERNIGHT-REPORT.md` under "Decisions I made alone".
- If a milestone runs > 1.5× its estimate, ship what's green, note the gap in the report, move on. M4, M5, M7 are the product; M8 and stretch are the first to cut.

---

## 7. Morning checklist (for Lucas)

- `git log --oneline main..feat/dark-identity` — one commit per milestone.
- `docs/OVERNIGHT-REPORT.md` — screenshots, decisions, gaps.
- `npm run dev` → `http://localhost:3000` — seeded accounts and passwords are listed in the report.
- Merge when happy; when Supabase is back, set the env and flip `ROSTER_DATA=supabase` — the adapter is there, untested.
