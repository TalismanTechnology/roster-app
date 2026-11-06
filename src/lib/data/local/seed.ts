import { randomUUID } from "node:crypto";

import type { CoachContact, FilmClip, Profile } from "@/lib/database.types";

import { parseMark } from "@/lib/sport-events";

import { hashPassword } from "./password";
import { parseFilmUrl } from "./film";

import { ATHLETES, DEMO_PASSWORD, STAFF_ACCOUNTS, type SeedAthlete } from "./seed-data";
import { emptyDb, type AchievementRow, type Db } from "./store";

/**
 * Builds the first-run database from seed-data.ts.
 *
 * Every athlete gets an account (`<handle>@roster.local`, password
 * `roster-demo`) so the editor can be opened as any of them. Verified
 * entries get a matching row in `verifications` attributed to the athlete's
 * first coach, so the audit trail is as real as the badge.
 */
export function buildSeed(): Db {
  const db = emptyDb();
  const createdAt = "2026-01-10T12:00:00.000Z";
  const passwordHash = hashPassword(DEMO_PASSWORD);

  for (const a of ATHLETES) {
    const id = randomUUID();
    db.users.push({ id, email: `${a.handle}@roster.local`, password_hash: passwordHash, created_at: createdAt });
    db.profiles.push(toProfile(id, a, createdAt));

    const coaches: CoachContact[] = a.coaches.map((c, i) => ({
      id: randomUUID(),
      profile_id: id,
      name: c.name,
      role: c.role,
      org_id: null,
      org_name: c.org,
      email: c.email ?? null,
      phone: c.phone ?? null,
      is_visible: true,
      position: i,
      created_at: createdAt,
    }));
    db.coach_contacts.push(...coaches);

    for (const e of a.entries) {
      const state = e.state ?? "unverified";
      const verifiedAt = state === "verified" ? `${e.on}T18:00:00.000Z` : null;
      const row: AchievementRow = {
        id: randomUUID(),
        profile_id: id,
        kind: e.kind,
        title: e.title,
        detail: e.detail ?? null,
        sport: a.sport,
        event_id: null,
        value_numeric: parseMark(e.value, e.unit),
        value_display: e.value ?? null,
        unit: e.unit ?? null,
        competition: e.competition ?? null,
        opponent: null,
        placement: e.placement ?? null,
        field_size: e.field ?? null,
        org_id: null,
        location: e.location ?? null,
        achieved_on: e.on,
        verification: state,
        verified_at: verifiedAt,
        is_pinned: e.pinned ?? false,
        created_at: `${e.on}T12:00:00.000Z`,
        updated_at: verifiedAt ?? `${e.on}T12:00:00.000Z`,
        org_name: e.org ?? null,
        event_name: e.event ?? null,
      };
      db.achievements.push(row);

      if (state === "verified" && coaches[0]) {
        db.verifications.push({
          id: randomUUID(),
          achievement_id: row.id,
          verifier_id: null,
          verifier_kind: "coach",
          outcome: "verified",
          method: "coach_attestation",
          note: null,
          verifier_name: `${coaches[0].name}, ${coaches[0].role}`,
          created_at: verifiedAt!,
        });
      }
    }

    a.film.forEach((f, i) => {
      const parsed = parseFilmUrl(f.url);
      const clip: FilmClip = {
        id: randomUUID(),
        profile_id: id,
        title: f.title,
        url: f.url,
        provider: parsed.provider,
        external_id: parsed.external_id,
        thumbnail_url:
          parsed.provider === "youtube" && parsed.external_id
            ? `https://i.ytimg.com/vi/${parsed.external_id}/hqdefault.jpg`
            : null,
        season: f.season ?? null,
        sport: a.sport,
        duration_s: null,
        is_featured: i === 0,
        position: i,
        created_at: createdAt,
        updated_at: createdAt,
      };
      db.film_clips.push(clip);
    });

    // Counters, as the trigger would leave them.
    const profile = db.profiles[db.profiles.length - 1];
    profile.entry_count = a.entries.length;
    profile.verified_count = a.entries.filter((e) => e.state === "verified").length;

    // A week of views so the editor's counter has something honest to show.
    for (let d = 0; d < 7; d++) {
      const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
      const count = ((a.handle.length * (d + 3)) % 5) + (profile.visibility === "public" ? 1 : 0);
      if (count > 0) db.profile_views.push({ profile_id: id, viewer_id: null, viewed_on: day, view_count: count });
    }
  }

  for (const s of STAFF_ACCOUNTS) {
    const id = randomUUID();
    db.users.push({ id, email: s.email, password_hash: passwordHash, created_at: createdAt });
    db.profiles.push({
      ...toProfile(id, { ...ATHLETES[0], handle: s.handle, name: s.name, entries: [], film: [], coaches: [] }, createdAt),
      account_kind: s.account_kind,
      visibility: "private",
      is_recruitable: false,
      bio: null,
      positions: [],
      primary_sport: null,
      grad_year: null,
      level: null,
      school: null,
      gpa: null,
      sat_score: null,
      act_score: null,
      height_cm: null,
      weight_kg: null,
      jersey: null,
      entry_count: 0,
      verified_count: 0,
    });
  }

  // The recruiter starts with one list so the feature has something to show.
  const recruiter = db.profiles.find((p) => p.account_kind === "recruiter")!;
  const listId = randomUUID();
  db.recruiter_lists.push({
    id: listId,
    owner_id: recruiter.id,
    name: "Class of 2027 receivers",
    note: "Texas first, then Georgia.",
    created_at: createdAt,
    updated_at: createdAt,
  });
  for (const handle of ["jordanreyes", "devinokafor"]) {
    const p = db.profiles.find((x) => x.handle === handle)!;
    db.recruiter_list_members.push({ list_id: listId, profile_id: p.id, note: null, added_at: createdAt });
  }

  return db;
}

function toProfile(id: string, a: SeedAthlete, createdAt: string): Profile {
  return {
    id,
    handle: a.handle,
    account_kind: "athlete",
    visibility: a.visibility ?? "public",
    display_name: a.name,
    title: null,
    avatar_url: null,
    cover_url: null,
    bio: a.bio,
    location: a.city,
    hometown: a.city,
    level: a.level,
    primary_sport: a.sport,
    grad_year: a.grad,
    height_cm: a.height,
    weight_kg: a.weight,
    positions: a.positions,
    jersey: a.jersey ?? null,
    region: a.region,
    school: a.school,
    gpa: a.gpa,
    sat_score: a.sat ?? null,
    act_score: a.act ?? null,
    ncaa_id: a.gpa ? String(2700000000 + a.handle.length * 1234567).slice(0, 10) : null,
    contact_email: `${a.handle}@example.com`,
    phone: null,
    is_recruitable: a.recruitable ?? false,
    instagram: `${a.handle}.${a.sport.split("_")[0]}`,
    x_handle: null,
    hudl_url: a.sport === "football" ? "https://www.hudl.com/profile/example" : null,
    results_url: a.sport === "track_field" ? "https://www.athletic.net/athlete/example" : null,
    entry_count: 0,
    verified_count: 0,
    identity_verified_at: null,
    suspended_at: null,
    viewer_summary_opt_in: false,
    created_at: createdAt,
    updated_at: createdAt,
  };
}
