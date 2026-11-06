import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { onboardingDestination } from "@/lib/accounts";
import {
  achievementSchema,
  athleteOnboardingSchema,
  imperialMeasurablesSchema,
  memberOnboardingSchema,
  onboardingKind,
  positionsField,
} from "@/lib/actions/schemas";
import { csvCell, csvFilename, toCsv } from "@/lib/csv";
import { handleFromName, isValidHandle } from "@/lib/handles";
import { LIST_CSV_HEADER, listMembersToCsv } from "@/lib/list-export";
import { cmToFeetInches, feetInchesToCm, heightLabel, kgToLbs, lbsToKg, weightLabel } from "@/lib/measurables";
import { MAX_POSITIONS, normalizePositions, positionsFor } from "@/lib/positions";
import {
  canonicalQuery,
  describeFilters,
  filtersToQuery,
  parsePage,
  parseSearchFilters,
  toSearchParams,
} from "@/lib/search-filters";
import { eventsFor, findEvent, formatMeasurable, isMarkUnit, parseMark, SPORT_EVENTS } from "@/lib/sport-events";
import { SPORTS } from "@/lib/sports";

import { LocalRepository } from "../local/repository";
import { searchProfiles } from "../local/search";
import { mutate, readDb, resetDb } from "../local/store";
import { isRecruiterKind, pickTopMark, summarizeViewers, swapNeighbour, weekStart } from "../rules";
import { DataError, type ListedAthlete } from "../types";

/**
 * Wave 8: recruiter workflows and athlete depth — imperial measurables,
 * sport event templates, positions, search filters and sort, saved searches,
 * list notes / move / CSV, role onboarding, the viewer summary, film and
 * reference edits. The local adapter plus the pure modules both adapters
 * and the actions share.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-wave8-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const userId = (email: string) => readDb().users.find((u) => u.email === email)!.id;
const profileId = (handle: string) => readDb().profiles.find((p) => p.handle === handle)!.id;

async function rejectsWith(promise: Promise<unknown>, code: DataError["code"]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected ${code}`);
}

// ---------------------------------------------------------------------------
// #54 imperial measurables
// ---------------------------------------------------------------------------

describe("imperial measurables", () => {
  it("converts both ways and survives a save → reload round trip", () => {
    assert.deepEqual(cmToFeetInches(188), { feet: 6, inches: 2 });
    assert.equal(feetInchesToCm(6, 2), 188);
    assert.equal(feetInchesToCm(5, null), 152);
    assert.equal(feetInchesToCm(null, null), null);
    assert.equal(cmToFeetInches(null), null);
    assert.equal(lbsToKg(185), 83.91);
    assert.equal(kgToLbs(83.91), 185);
    assert.equal(kgToLbs(null), null);
    // Every whole height from 4'0" to 7'6" and weight from 80 to 400 lbs comes back as typed.
    for (let inches = 48; inches <= 90; inches++) {
      const back = cmToFeetInches(feetInchesToCm(Math.floor(inches / 12), inches % 12));
      assert.equal(back!.feet * 12 + back!.inches, inches, `height ${inches}in`);
    }
    for (let lbs = 80; lbs <= 400; lbs++) assert.equal(kgToLbs(lbsToKg(lbs)), lbs, `weight ${lbs}lbs`);
  });

  it("labels stay what the resume always showed", () => {
    assert.equal(heightLabel(170), `5'7"`);
    assert.equal(weightLabel(59), "130 lbs");
    assert.equal(heightLabel(null), null);
  });

  it("the editor schema turns ft/in/lbs into the metric columns and refuses nonsense", () => {
    const ok = imperialMeasurablesSchema.parse({ height_ft: "6", height_in: "2", weight_lbs: "185" });
    assert.deepEqual(ok, { height_cm: 188, weight_kg: 83.91 });
    assert.deepEqual(imperialMeasurablesSchema.parse({ height_ft: "", height_in: "", weight_lbs: "" }), {
      height_cm: null,
      weight_kg: null,
    });
    assert.equal(imperialMeasurablesSchema.safeParse({ height_ft: "6", height_in: "13", weight_lbs: "" }).success, false);
    assert.equal(imperialMeasurablesSchema.safeParse({ height_ft: "", height_in: "74", weight_lbs: "" }).success, false);
    assert.equal(imperialMeasurablesSchema.safeParse({ height_ft: "9", height_in: "", weight_lbs: "" }).success, false);
    assert.equal(imperialMeasurablesSchema.safeParse({ height_ft: "", height_in: "", weight_lbs: "20" }).success, false);
  });

  it("an imperial save round-trips through the local adapter", async () => {
    const id = profileId("jordanreyes");
    const m = imperialMeasurablesSchema.parse({ height_ft: "5", height_in: "11", weight_lbs: "172" });
    const saved = await repo.updateProfile(id, m);
    assert.deepEqual(cmToFeetInches(saved.height_cm), { feet: 5, inches: 11 });
    assert.equal(kgToLbs(saved.weight_kg), 172);
  });
});

// ---------------------------------------------------------------------------
// #55 sport event templates
// ---------------------------------------------------------------------------

describe("sport event templates", () => {
  it("cover the main sports with unique slugs and known units", () => {
    for (const sport of ["football", "track_field", "swimming", "basketball", "soccer", "baseball"]) {
      assert.ok(eventsFor(sport).length >= 3, `${sport} has templates`);
    }
    const sportKeys = new Set(SPORTS.map(([k]) => k));
    for (const [sport, events] of Object.entries(SPORT_EVENTS)) {
      assert.ok(sportKeys.has(sport), `${sport} is a real sport key`);
      assert.equal(new Set(events.map((e) => e.slug)).size, events.length, `${sport} slugs unique`);
      for (const e of events) assert.ok(isMarkUnit(e.unit), `${sport}/${e.slug} unit ${e.unit}`);
    }
    assert.deepEqual(eventsFor("other"), []);
    assert.deepEqual(eventsFor(null), []);
    assert.equal(findEvent("football", "40yd")?.unit, "sec");
    assert.equal(findEvent("football", "40yd")?.direction, "lower_is_better");
    assert.equal(findEvent("football", "nope"), null);
  });

  it("parses marks as each sport writes them", () => {
    assert.equal(parseMark("10.84", "sec"), 10.84);
    assert.equal(parseMark("4:12.50", "sec"), 252.5);
    assert.equal(parseMark("1:02:03.4", "sec"), 3723.4);
    assert.equal(parseMark("4.48", "s"), 4.48);
    assert.equal(parseMark("6-08.25", "in"), 80.25);
    assert.equal(parseMark(`22' 4"`, "in"), 268);
    assert.equal(parseMark("36.5", "in"), 36.5);
    assert.equal(parseMark("315 lbs", "lbs"), 315);
    assert.equal(parseMark("1,250", "pts"), 1250);
    assert.equal(parseMark("21 G · 6 A", "pts"), null);
    assert.equal(parseMark("1st", "sec"), null);
    assert.equal(parseMark("10.84", null), null);
    assert.equal(parseMark(null, "sec"), null);
  });

  it("formats stored numbers back for chips", () => {
    assert.equal(formatMeasurable(252.5, "sec"), "4:12.50");
    assert.equal(formatMeasurable(10.84, "sec"), "10.84 sec");
    assert.equal(formatMeasurable(80.25, "in"), `6' 8.25"`);
    assert.equal(formatMeasurable(36.5, "in"), "36.5 in");
    assert.equal(formatMeasurable(92, "mph"), "92 mph");
  });

  it("the entry schema derives value_numeric from the mark and unit", () => {
    const base = { kind: "personal_record", title: "1600m", detail: "", competition: "", location: "", placement: "", field_size: "", achieved_on: "2026-05-01" };
    assert.equal(achievementSchema.parse({ ...base, value_display: "4:12.50", unit: "sec" }).value_numeric, 252.5);
    const noUnit = achievementSchema.parse({ ...base, value_display: "4:12.50", unit: "" });
    assert.equal(noUnit.unit, null);
    assert.equal(noUnit.value_numeric, null);
  });

  it("both fields persist locally, and a unit-less number is dropped (measured_has_unit)", async () => {
    const id = profileId("jordanreyes");
    const entry = await repo.addEntry(id, {
      kind: "personal_record",
      title: "Vertical jump test",
      detail: null,
      value_display: "38",
      competition: null,
      location: null,
      placement: null,
      field_size: null,
      achieved_on: "2026-05-01",
      unit: "in",
      value_numeric: 38,
    });
    assert.equal(entry.value_numeric, 38);
    assert.equal(entry.unit, "in");
    const cleared = await repo.updateEntry(id, entry.id, { unit: null, value_numeric: 38 });
    assert.equal(cleared.value_numeric, null);
  });

  it("seeded marks carry their number", async () => {
    const entries = await repo.listEntries(profileId("jordanreyes"));
    const dash = entries.find((e) => e.title === "40-yard dash");
    assert.equal(dash?.value_numeric, 4.48);
  });
});

// ---------------------------------------------------------------------------
// #60 positions
// ---------------------------------------------------------------------------

describe("position chips", () => {
  it("normalizes, dedupes case-insensitively, and caps at six", () => {
    assert.deepEqual(normalizePositions("WR, db ,wr,,  Slot "), ["WR", "db", "Slot"]);
    assert.equal(normalizePositions("a,b,c,d,e,f,g,h").length, MAX_POSITIONS);
    assert.deepEqual(positionsField.parse(""), []);
    assert.ok(positionsFor("football").includes("WR"));
    assert.deepEqual(positionsFor("other"), []);
  });
});

// ---------------------------------------------------------------------------
// #85 search filters & sort
// ---------------------------------------------------------------------------

describe("search filters", () => {
  it("parses forgivingly and serializes canonically", () => {
    const f = parseSearchFilters({ sport: "football", gpa: "3.25", sort: "gpa", state: "tx", class: "2027", verified: "1", position: " WR " });
    assert.equal(f.sport, "football");
    assert.equal(f.minGpa, 3.25);
    assert.equal(f.sort, "gpa");
    assert.equal(f.region, "TX");
    assert.equal(f.position, "WR");
    assert.equal(filtersToQuery(f), "sport=football&position=WR&class=2027&state=TX&gpa=3.25&verified=1&sort=gpa");

    const junk = parseSearchFilters({ sport: "quidditch", gpa: "9", sort: "random", level: "pro", class: "-3", page: "x" });
    assert.equal(junk.sport, null);
    assert.equal(junk.minGpa, null);
    assert.equal(junk.sort, "verified_count");
    assert.equal(junk.level, null);
    assert.equal(junk.gradYear, null);
    assert.equal(filtersToQuery(junk), "");
    assert.equal(parsePage({ page: "x" }), 1);
    assert.equal(parsePage({ page: "3" }), 3);
  });

  it("canonicalizes a stored query and describes the filters", () => {
    assert.equal(canonicalQuery("?sort=recent&sport=soccer&evil=<script>"), "sport=soccer&sort=recent");
    assert.equal(canonicalQuery(filtersToQuery(parseSearchFilters({ q: "  Reyes  ", gpa: "3" }))), "q=Reyes&gpa=3");
    assert.deepEqual(describeFilters(parseSearchFilters({ gpa: "3", verified: "1", position: "QB" })), ["Plays QB", "GPA 3.0+", "Verified only"]);
    assert.equal(filtersToQuery(parseSearchFilters({ sport: "soccer" }), 2), "sport=soccer&page=2");
  });

  it("filters on GPA and sorts by each key in the local adapter", () => {
    const profiles = readDb().profiles;
    const base = toSearchParams(parseSearchFilters({}), 1, 100);

    const floor = searchProfiles(profiles, { ...base, minGpa: 3.5 });
    assert.ok(floor.total > 0);
    assert.ok(floor.athletes.every((p) => p.gpa !== null && p.gpa >= 3.5));

    const byGpa = searchProfiles(profiles, { ...base, sort: "gpa" }).athletes;
    const gpas = byGpa.map((p) => p.gpa);
    const firstNull = gpas.indexOf(null);
    const ranked = (firstNull === -1 ? gpas : gpas.slice(0, firstNull)) as number[];
    assert.deepEqual(ranked, [...ranked].sort((a, b) => b - a));
    if (firstNull !== -1) assert.ok(gpas.slice(firstNull).every((g) => g === null), "nulls last");

    const byYear = searchProfiles(profiles, { ...base, sort: "graduation_year" }).athletes.map((p) => p.grad_year).filter((y) => y !== null) as number[];
    assert.deepEqual(byYear, [...byYear].sort((a, b) => a - b));

    const recent = searchProfiles(profiles, { ...base, sort: "recent" }).athletes.map((p) => p.updated_at);
    assert.deepEqual(recent, [...recent].sort().reverse());

    const verified = searchProfiles(profiles, base).athletes.map((p) => p.verified_count);
    assert.deepEqual(verified, [...verified].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------------
// #88 saved searches
// ---------------------------------------------------------------------------

describe("saved searches (local)", () => {
  it("saves, replaces by name, toggles digest, deletes — owner only", async () => {
    const owner = userId("recruiter@roster.local");
    const other = userId("coach@roster.local");

    const first = await repo.saveSearch(owner, "TX receivers", "sport=football&state=TX", false);
    assert.equal(first.digest, false);
    const replaced = await repo.saveSearch(owner, "TX receivers", "sport=football&state=TX&class=2027", true);
    assert.equal(replaced.id, first.id);
    assert.equal(replaced.digest, true);

    const mine = await repo.listSavedSearches(owner);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].query, "sport=football&state=TX&class=2027");
    assert.deepEqual(await repo.listSavedSearches(other), []);

    await rejectsWith(repo.setSavedSearchDigest(other, first.id, false), "not_found");
    await repo.setSavedSearchDigest(owner, first.id, false);
    assert.equal((await repo.listSavedSearches(owner))[0].digest, false);

    await rejectsWith(repo.deleteSavedSearch(other, first.id), "not_found");
    await repo.deleteSavedSearch(owner, first.id);
    assert.deepEqual(await repo.listSavedSearches(owner), []);
  });

  it("go with the account", async () => {
    const owner = userId("coach@roster.local");
    await repo.saveSearch(owner, "Keepers", "position=GK", false);
    await mutate((db) => {
      assert.equal(db.saved_searches.filter((s) => s.owner_id === owner).length, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// #86 / #89 list notes, move, CSV
// ---------------------------------------------------------------------------

describe("list notes, moves, and export", () => {
  it("sets and clears a member note; refuses one for an athlete not on the list", async () => {
    const owner = userId("recruiter@roster.local");
    const [list] = await repo.listLists(owner);
    const jordan = profileId("jordanreyes");
    await repo.setListNote(owner, list.id, jordan, "Call after the spring combine.");
    let detail = await repo.getList(owner, list.id);
    assert.equal(detail!.members.find((m) => m.id === jordan)!.list_note, "Call after the spring combine.");
    await repo.setListNote(owner, list.id, jordan, null);
    detail = await repo.getList(owner, list.id);
    assert.equal(detail!.members.find((m) => m.id === jordan)!.list_note, null);

    await rejectsWith(repo.setListNote(owner, list.id, profileId("ninakowalczyk"), "x"), "not_found");
    await rejectsWith(repo.setListNote(userId("coach@roster.local"), list.id, jordan, "x"), "not_found");
  });

  it("moves an athlete with their note; already on the target just leaves the source", async () => {
    const owner = userId("recruiter@roster.local");
    const [from] = await repo.listLists(owner);
    const to = await repo.createList(owner, "Visits", null);
    const devin = profileId("devinokafor");
    await repo.setListNote(owner, from.id, devin, "Fast.");
    await repo.moveListMember(owner, from.id, to.id, devin);
    assert.deepEqual(await repo.listsContaining(owner, devin), [to.id]);
    assert.equal((await repo.getList(owner, to.id))!.members[0].list_note, "Fast.");

    // Back onto both, then move again: no duplicate row.
    await repo.addToList(owner, from.id, devin, null);
    await repo.moveListMember(owner, from.id, to.id, devin);
    assert.equal(readDb().recruiter_list_members.filter((m) => m.profile_id === devin && m.list_id === to.id).length, 1);
    await rejectsWith(repo.moveListMember(owner, from.id, to.id, devin), "not_found");
  });

  it("CSV quotes, neutralizes formulas, and serializes list rows", () => {
    assert.equal(csvCell('He said "go"'), '"He said ""go"""');
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell("+1 555"), "'+1 555");
    assert.equal(csvCell("@cmd"), "'@cmd");
    assert.equal(csvCell(-3), "-3");
    assert.equal(csvCell(null), "");
    assert.equal(toCsv(["a", "b"], [[1, "x\ny"]]), 'a,b\r\n1,"x\ny"\r\n');
    assert.equal(csvFilename("Spring visits!"), "spring-visits.csv");
    assert.equal(csvFilename("!!!"), "list.csv");

    const jordan = readDb().profiles.find((p) => p.handle === "jordanreyes")!;
    const member: ListedAthlete = { ...jordan, display_name: "=cmd|' /C calc'!A0", list_note: "Note, with comma", added_at: "2026-06-01T00:00:00Z" };
    const csv = listMembersToCsv([member]);
    const [header, row] = csv.trim().split("\r\n");
    assert.equal(header, LIST_CSV_HEADER.join(","));
    assert.ok(row.startsWith(`"'=cmd|' /C calc'!A0"`) || row.startsWith(`'=cmd|' /C calc'!A0`), row);
    assert.ok(row.includes('"Note, with comma"'));
    assert.ok(row.endsWith("2026-06-01"));
  });

  it("the export hides contact email unless the athlete is open to recruiting", () => {
    const jordan = readDb().profiles.find((p) => p.handle === "jordanreyes")!;
    const closed: ListedAthlete = { ...jordan, is_recruitable: false, contact_email: "x@example.com", list_note: null, added_at: "2026-06-01T00:00:00Z" };
    assert.ok(!listMembersToCsv([closed]).includes("x@example.com"));
    assert.ok(listMembersToCsv([{ ...closed, is_recruitable: true, visibility: "public" }]).includes("x@example.com"));
  });
});

// ---------------------------------------------------------------------------
// #52 role onboarding
// ---------------------------------------------------------------------------

describe("role onboarding", () => {
  it("branches on the chosen kind; anything else is the athlete flow", () => {
    assert.equal(onboardingKind.parse("recruiter"), "recruiter");
    assert.equal(onboardingKind.parse("coach"), "coach");
    assert.equal(onboardingKind.parse(""), "athlete");
    assert.equal(onboardingKind.parse("staff"), "athlete");
    assert.equal(onboardingKind.parse("brand"), "athlete");
    assert.equal(onboardingDestination("athlete"), "/resume");
    assert.equal(onboardingDestination("recruiter"), "/search");
    assert.equal(onboardingDestination("coach"), "/search");
    assert.ok(isRecruiterKind("recruiter") && isRecruiterKind("coach") && isRecruiterKind("staff"));
    assert.ok(!isRecruiterKind("athlete") && !isRecruiterKind(null));
  });

  it("recruiters skip handle and sport; athletes still need both", () => {
    const member = memberOnboardingSchema.safeParse({ display_name: "Pat Lee", school: "Oregon", title: "" });
    assert.ok(member.success);
    assert.equal(member.data.title, null);
    assert.equal(memberOnboardingSchema.safeParse({ display_name: "Pat Lee", school: "", title: "" }).success, false);
    const athlete = athleteOnboardingSchema.safeParse({ display_name: "Pat Lee", level: "high_school", handle: "", primary_sport: "", grad_year: "" });
    assert.equal(athlete.success, false);
  });

  it("generates valid handles from names", () => {
    assert.equal(handleFromName("Casey Morgan", "k3f9"), "casey_morgan_k3f9");
    assert.equal(handleFromName("José Núñez-Ortiz", "ab12"), "jose_nunez_ortiz_ab12");
    assert.equal(handleFromName("!!!", "ab12"), "member_ab12");
    assert.ok(isValidHandle(handleFromName("A very long name that goes on and on forever", "ffffff")));
  });

  it("creates a recruiter profile with program and title, no level or sport", async () => {
    const id = (await repo.signUp(`recruiter-${Date.now()}@roster.local`, "password123")).id;
    const profile = await repo.createProfile({
      id,
      handle: handleFromName("Pat Lee", "aa11"),
      display_name: "Pat Lee",
      level: null,
      account_kind: "recruiter",
      visibility: "private",
      school: "University of Oregon",
      title: "Recruiting Coordinator",
    });
    assert.equal(profile.account_kind, "recruiter");
    assert.equal(profile.school, "University of Oregon");
    assert.equal(profile.title, "Recruiting Coordinator");
    assert.equal(profile.primary_sport, null);
    assert.equal(profile.viewer_summary_opt_in, false);
  });
});

// ---------------------------------------------------------------------------
// #90 viewer summary
// ---------------------------------------------------------------------------

describe("viewer summary", () => {
  it("counts distinct recruiter and coach viewers this week, never anonymous or old views", () => {
    const kinds: Record<string, "recruiter" | "coach" | "athlete"> = { r1: "recruiter", r2: "recruiter", c1: "coach", a1: "athlete" };
    const today = new Date().toISOString().slice(0, 10);
    const views = [
      { profile_id: "p", viewer_id: "r1", viewed_on: today, view_count: 3 },
      { profile_id: "p", viewer_id: "r1", viewed_on: weekStart(), view_count: 1 },
      { profile_id: "p", viewer_id: "r2", viewed_on: today, view_count: 1 },
      { profile_id: "p", viewer_id: "c1", viewed_on: today, view_count: 1 },
      { profile_id: "p", viewer_id: "a1", viewed_on: today, view_count: 1 },
      { profile_id: "p", viewer_id: null, viewed_on: today, view_count: 9 },
      { profile_id: "p", viewer_id: "c1", viewed_on: "2020-01-01", view_count: 1 },
      { profile_id: "other", viewer_id: "r1", viewed_on: today, view_count: 1 },
    ];
    assert.deepEqual(summarizeViewers(views, (id) => kinds[id], "p", weekStart()), { recruiters: 2, coaches: 1 });
  });

  it("the local adapter counts a signed-in recruiter's view", async () => {
    const athlete = profileId("ninakowalczyk");
    const before = await repo.viewerSummary(athlete);
    await repo.recordView(athlete, userId("recruiter@roster.local"));
    await repo.recordView(athlete, userId("recruiter@roster.local"));
    await repo.recordView(athlete, null);
    const afterViews = await repo.viewerSummary(athlete);
    assert.equal(afterViews.recruiters, before.recruiters + 1);
    assert.equal(afterViews.coaches, before.coaches);
  });

  it("the opt-in is the athlete's to set", async () => {
    const id = profileId("ninakowalczyk");
    assert.equal((await repo.updateProfile(id, { viewer_summary_opt_in: true })).viewer_summary_opt_in, true);
  });
});

// ---------------------------------------------------------------------------
// #56 film and reference edits; #91 top marks
// ---------------------------------------------------------------------------

describe("film and reference edits", () => {
  it("swapNeighbour moves one step and stops at the ends", () => {
    assert.deepEqual(swapNeighbour(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(swapNeighbour(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
    assert.deepEqual(swapNeighbour(["a", "b", "c"], "a", "up"), ["a", "b", "c"]);
    assert.deepEqual(swapNeighbour(["a", "b", "c"], "c", "down"), ["a", "b", "c"]);
    assert.deepEqual(swapNeighbour(["a"], "z", "up"), ["a"]);
  });

  it("edits a clip (re-deriving the provider) and reorders, renumbering gaps", async () => {
    const id = profileId("avareyes");
    const a = await repo.addFilm(id, { title: "Clip A", url: "https://vimeo.com/123", season: null });
    const b = await repo.addFilm(id, { title: "Clip B", url: "https://vimeo.com/456", season: null });
    const edited = await repo.updateFilm(id, a.id, { title: "Clip A (cut)", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", season: "2026" });
    assert.equal(edited.title, "Clip A (cut)");
    assert.equal(edited.provider, "youtube");
    assert.ok(edited.thumbnail_url?.includes("dQw4w9WgXcQ"));

    // A gap in positions (a delete elsewhere) must not stall the move.
    await mutate((db) => {
      db.film_clips.find((f) => f.id === b.id)!.position = 40;
    });
    await repo.moveFilm(id, b.id, "up");
    const order = (await repo.listFilm(id)).sort((x, y) => x.position - y.position).map((f) => f.id);
    assert.ok(order.indexOf(b.id) < order.indexOf(a.id));
    const positions = (await repo.listFilm(id)).map((f) => f.position).sort((x, y) => x - y);
    assert.deepEqual(positions, positions.map((_, i) => i));

    await rejectsWith(repo.updateFilm(profileId("jordanreyes"), a.id, { title: "x", url: "https://x.y", season: null }), "not_found");
  });

  it("edits a reference and hides it from recruiters without losing it", async () => {
    const id = profileId("jordanreyes");
    const [coach] = await repo.listCoaches(id, id);
    const edited = await repo.updateCoach(id, coach.id, { role: "Offensive Coordinator", is_visible: false });
    assert.equal(edited.role, "Offensive Coordinator");
    assert.equal(edited.is_visible, false);
    assert.ok((await repo.listCoaches(id, id)).some((c) => c.id === coach.id), "owner still sees it");
    assert.ok(!(await repo.listCoaches(id, null)).some((c) => c.id === coach.id), "recruiters do not");
    await repo.updateCoach(id, coach.id, { is_visible: true });
    await rejectsWith(repo.updateCoach(profileId("avareyes"), coach.id, { name: "x" }), "not_found");
  });

  it("picks the top verified mark per athlete: pinned first, then newest", async () => {
    assert.equal(pickTopMark([]), null);
    const top = pickTopMark([
      { title: "Old", value_display: "1", unit: null, verification: "verified", is_pinned: false, verified_at: "2026-01-01" },
      { title: "New", value_display: "2", unit: null, verification: "verified", is_pinned: false, verified_at: "2026-05-01" },
      { title: "Unverified pin", value_display: "3", unit: null, verification: "unverified", is_pinned: true, verified_at: null },
    ]);
    assert.equal(top?.title, "New");

    const marks = await repo.topVerifiedMarks([profileId("jordanreyes"), profileId("graceokoro")]);
    assert.ok(marks[profileId("jordanreyes")], "Jordan has a verified mark");
  });
});
