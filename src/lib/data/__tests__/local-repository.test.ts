import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { LocalRepository } from "../local/repository";
import { resetDb, readDb } from "../local/store";
import { DataError } from "../types";

/**
 * Behavioral checks against the file-backed adapter — the local-mode
 * counterpart to supabase/tests/schema_test.sql. Runs against a throwaway
 * directory so it never touches the developer's own `.data/`.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-test-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("seed", () => {
  it("seeds athletes across sports with demo accounts", async () => {
    const jordan = await repo.getProfileByHandle("jordanreyes", null);
    assert.ok(jordan);
    assert.equal(jordan.primary_sport, "football");
    assert.ok(jordan.verified_count > 0);
    assert.ok(await repo.signIn("jordanreyes@roster.local", "roster-demo"));
    assert.equal(await repo.signIn("jordanreyes@roster.local", "wrong"), null);
  });
});

describe("visibility", () => {
  it("withdraws athlete contact from public reads and discovery while preserving owner values", async () => {
    const owner = (await repo.getProfileByHandle("jordanreyes", null))!;
    await repo.updateProfile(owner.id, {contact_email: "recruiting@example.com", phone: "555-0100", is_recruitable: false});
    try {
      for (const viewer of [null, "stranger"]) {
        const profile = (await repo.getProfileByHandle(owner.handle, viewer))!;
        assert.equal(profile.contact_email, null);
        assert.equal(profile.phone, null);
      }
      const own = (await repo.getProfileByHandle(owner.handle, owner.id))!;
      assert.equal(own.contact_email, "recruiting@example.com");
      assert.equal(own.phone, "555-0100");
      const listed = (await repo.searchAthletes({q: owner.display_name})).find(p => p.id === owner.id)!;
      assert.equal(listed.contact_email, null);
      assert.equal(listed.phone, null);
      await repo.updateProfile(owner.id, {is_recruitable: true});
      assert.equal((await repo.getProfileByHandle(owner.handle, null))!.contact_email, "recruiting@example.com");
      await repo.updateProfile(owner.id, {visibility: "unlisted"});
      for (const viewer of [null, "stranger"]) {
        const profile = (await repo.getProfileByHandle(owner.handle, viewer))!;
        assert.equal(profile.contact_email, null);
        assert.equal(profile.phone, null);
      }
      assert.equal((await repo.getProfileByHandle(owner.handle, owner.id))!.contact_email, "recruiting@example.com");
    } finally {
      await repo.updateProfile(owner.id, {contact_email: owner.contact_email, phone: owner.phone, is_recruitable: owner.is_recruitable, visibility: owner.visibility});
    }
  });
  it("private resumes are not found by others, found by the owner", async () => {
    const owner = await repo.signIn("graceokoro@roster.local", "roster-demo");
    assert.ok(owner);
    assert.equal(await repo.getProfileByHandle("graceokoro", null), null);
    assert.equal(await repo.getProfileByHandle("graceokoro", "stranger"), null);
    assert.ok(await repo.getProfileByHandle("graceokoro", owner.id));
  });
  it("unlisted resumes open by link but stay out of search", async () => {
    assert.ok(await repo.getProfileByHandle("elijahbrooks", null));
    const results = await repo.searchAthletes({ q: "Elijah" });
    assert.equal(results.some((p) => p.handle === "elijahbrooks"), false);
  });
  it("coach contact details need public + recruitable", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const coaches = await repo.listCoaches(jordan.id, null);
    assert.ok(coaches.length > 0);
    assert.ok(coaches[0].email); // recruitable → visible

    // Not recruitable → the rows do not exist for a viewer, name included
    // (coach_contacts_select returns nothing; so must the local adapter).
    await repo.updateProfile(jordan.id, { is_recruitable: false });
    assert.equal((await repo.listCoaches(jordan.id, null)).length, 0);
    const own = await repo.listCoaches(jordan.id, jordan.id);
    assert.ok(own[0].email); // owner always sees
    await repo.updateProfile(jordan.id, { is_recruitable: true });

    // Unlisted is a link the athlete hands out; it must not carry a coach's
    // identity to whoever it gets forwarded to.
    await repo.updateProfile(jordan.id, { visibility: "unlisted" });
    assert.equal((await repo.listCoaches(jordan.id, null)).length, 0);
    await repo.updateProfile(jordan.id, { visibility: "public" });
  });
});

describe("handles", () => {
  it("refuses reserved and taken handles", async () => {
    assert.equal(await repo.isHandleAvailable("search"), false);
    assert.equal(await repo.isHandleAvailable("jordanreyes"), false);
    assert.equal(await repo.isHandleAvailable("a"), false);
    assert.equal(await repo.isHandleAvailable("new_athlete_42"), true);
    await assert.rejects(
      repo.createProfile({ id: "x", handle: "settings", display_name: "X", level: "club" }),
      (e: unknown) => e instanceof DataError && e.code === "invalid",
    );
  });
});

describe("the record", () => {
  it("adds, counts, pins, and deletes entries", async () => {
    const user = await repo.signUp("new@roster.local", "password123");
    const profile = await repo.createProfile({ id: user.id, handle: "newathlete", display_name: "New Athlete", level: "club" });
    assert.equal(profile.entry_count, 0);

    const entry = await repo.addEntry(profile.id, {
      kind: "personal_record", title: "100m", detail: null, value_display: "11.20",
      competition: null, location: null, placement: null, field_size: null, achieved_on: "2026-05-01",
    });
    assert.equal(entry.verification, "unverified");
    assert.equal((await repo.getProfileById(profile.id))!.entry_count, 1);

    await repo.setPinned(profile.id, entry.id, true);
    assert.equal((await repo.listEntries(profile.id))[0].is_pinned, true);

    // Another athlete cannot touch it.
    await assert.rejects(repo.deleteEntry("someone-else", entry.id), (e: unknown) => e instanceof DataError);

    await repo.deleteEntry(profile.id, entry.id);
    assert.equal((await repo.getProfileById(profile.id))!.entry_count, 0);
  });

  it("parses film URLs on write", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const clip = await repo.addFilm(jordan.id, { title: "Test", url: "https://youtu.be/dQw4w9WgXcQ", season: null });
    assert.equal(clip.provider, "youtube");
    assert.equal(clip.external_id, "dQw4w9WgXcQ");
    await repo.deleteFilm(jordan.id, clip.id);
  });
});

describe("verification by link", () => {
  it("runs the full request → respond loop and refuses self-verification", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const before = jordan.verified_count;
    const entries = await repo.listEntries(jordan.id);
    const unverified = entries.find((e) => e.verification === "unverified")!;
    const coach = (await repo.listCoaches(jordan.id, jordan.id))[0];

    const request = await repo.requestVerification(jordan.id, unverified.id, coach.id);
    assert.equal(request.status, "pending");
    assert.equal((await repo.listEntries(jordan.id)).find((e) => e.id === unverified.id)!.verification, "submitted");

    const detail = await repo.getVerificationRequest(request.token);
    assert.ok(detail);
    assert.equal(detail.athlete.handle, "jordanreyes");
    assert.deepEqual(Object.keys(detail.athlete).sort(), ["display_name", "handle", "id"]);
    assert.deepEqual(Object.keys(detail.coach).sort(), ["id", "name", "role"]);

    await assert.rejects(
      repo.respondToVerification(request.token, "verified", null, { name: "Coach", role: null }, jordan.id),
      (e: unknown) => e instanceof DataError && e.code === "forbidden",
    );

    const coachUser = await repo.signUp(coach.email!, "password123");
    await repo.createProfile({id:coachUser.id,handle:"invited_coach",display_name:"Coach",account_kind:"coach",level:null});
    await assert.rejects(repo.respondToVerification(request.token,"verified",null,{name:"Anonymous",role:null},null));
    await repo.respondToVerification(request.token, "verified", "Saw it myself.", { name: "Tom Bradley", role: "Head Coach" }, coachUser.id);
    const after = (await repo.getProfileById(jordan.id))!;
    assert.equal(after.verified_count, before + 1);
    assert.equal((await repo.listEntries(jordan.id)).find((e) => e.id === unverified.id)!.verification, "verified");

    // Single use.
    await assert.rejects(
      repo.respondToVerification(request.token, "verified", null, { name: "Again", role: null }, null),
      (e: unknown) => e instanceof DataError,
    );
  });
});

describe("signals and lists", () => {
  it("counts anonymous views but never self-views", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const before = await repo.weeklyViews(jordan.id);
    await repo.recordView(jordan.id, null);
    await repo.recordView(jordan.id, jordan.id);
    assert.equal(await repo.weeklyViews(jordan.id), before + 1);
  });

  it("recruiter lists are owner-only and drop resumes that go private", async () => {
    const recruiter = (await repo.signIn("recruiter@roster.local", "roster-demo"))!;
    const lists = await repo.listLists(recruiter.id);
    assert.ok(lists.length > 0);
    assert.equal((await repo.getList("someone-else", lists[0].id)), null);

    const list = await repo.createList(recruiter.id, "Keepers", null);
    const nina = (await repo.getProfileByHandle("ninakowalczyk", null))!;
    await repo.addToList(recruiter.id, list.id, nina.id, "Watch the shootout clip.");
    assert.equal((await repo.getList(recruiter.id, list.id))!.members.length, 1);

    await repo.updateProfile(nina.id, { visibility: "private" });
    assert.equal((await repo.getList(recruiter.id, list.id))!.members.length, 0);
    await repo.updateProfile(nina.id, { visibility: "public" });

    const grace = (await repo.getProfileByHandle("graceokoro", "stranger")) ?? null;
    assert.equal(grace, null);
  });
});

describe("search", () => {
  it("tolerates a misspelled name and ranks verified first", async () => {
    const results = await repo.searchAthletes({ q: "Jordn Reys" });
    assert.equal(results[0]?.handle, "jordanreyes");
    const football = await repo.searchAthletes({ sport: "football" });
    assert.ok(football.every((p) => p.primary_sport === "football"));
    assert.ok(football.every((p) => p.visibility === "public"));
  });
});


describe("core authority and edit behavior", () => {
 it("refuses signup authority and preserves protected profile fields", async () => {
  const user=await repo.signUp("authority@example.org","password123");
  await assert.rejects(repo.createProfile({id:user.id,handle:"badstaff",display_name:"No",level:null,account_kind:"staff"}));
  const profile=await repo.createProfile({id:user.id,handle:"goodcoach",display_name:"Coach",level:null,account_kind:"coach"});
  await repo.updateProfile(user.id,{account_kind:"staff",entry_count:999,verified_count:999,identity_verified_at:new Date().toISOString()});
  assert.equal((await repo.getProfileById(user.id))!.account_kind,profile.account_kind);
  assert.equal((await repo.getProfileById(user.id))!.verified_count,0);
 });
 it("edits invalidate an attestation and outstanding requests", async () => {
  const athlete=(await repo.getProfileByHandle("jordanreyes",null))!;
  const coach=(await repo.listCoaches(athlete.id,athlete.id))[0];
  const coachUser=(await repo.signIn(coach.email!,"password123"))!;
  const entry=(await repo.listEntries(athlete.id)).find(e=>e.verification==='verified')!;
  await repo.updateEntry(athlete.id,entry.id,{title:"Corrected result"});
  assert.equal((await repo.listEntries(athlete.id)).find(e=>e.id===entry.id)!.verification,"unverified");
  const request=await repo.requestVerification(athlete.id,entry.id,coach.id);
  await repo.updateEntry(athlete.id,entry.id,{title:"Corrected again"});
  await assert.rejects(repo.respondToVerification(request.token,"verified",null,{name:"Coach",role:null},coachUser.id));
 });
 it("updates owned list names and member notes, rejects foreign owners", async () => {
  const owner=(await repo.getProfileByHandle("jordanreyes",null))!;
  const list=await repo.createList(owner.id,"Core tests",null);
  await repo.addToList(owner.id,list.id,owner.id,null);
  await repo.updateList(owner.id,list.id,"Core renamed","List note");
  await repo.updateListMemberNote(owner.id,list.id,owner.id,"Athlete note");
  const detail=(await repo.getList(owner.id,list.id))!;
  assert.equal(detail.list.name,"Core renamed"); assert.equal(detail.members[0].list_note,"Athlete note");
  await assert.rejects(repo.updateListMemberNote("someone",list.id,owner.id,"Hacked"));
 });
});


describe("account data deletion", () => {
 it("removes owned resume, references, film, lists, and login while preserving other accounts", async () => {
  const user=await repo.signUp("delete-me@example.org","password123");
  await repo.createProfile({id:user.id,handle:"delete_me",display_name:"Delete Me",level:"club"});
  await repo.addFilm(user.id,{title:"My film",url:"https://youtu.be/dQw4w9WgXcQ",season:null});
  const coach=await repo.addCoach(user.id,{name:"Coach",role:null,org_name:null,email:"coach@example.org",phone:null});
  const entry=await repo.addEntry(user.id,{kind:"result",title:"My result",detail:null,value_display:null,competition:null,location:null,placement:null,field_size:null,achieved_on:"2026-01-01"});
  await repo.requestVerification(user.id,entry.id,coach.id);
  const list=await repo.createList(user.id,"My shortlist",null);
  await repo.addToList(user.id,list.id,user.id,null);
  await repo.deleteAccount(user.id);
  await repo.deleteAccount(user.id);
  assert.equal(await repo.getUser(user.id),null);
  const db=readDb();
  for(const rows of [db.profiles,db.achievements,db.film_clips,db.coach_contacts,db.verification_requests]) assert.equal(rows.some(row => ('profile_id' in row ? row.profile_id : row.id)===user.id),false);
  assert.equal(db.recruiter_lists.some(row=>row.owner_id===user.id),false);
  assert.equal(db.recruiter_list_members.some(row=>row.list_id===list.id||row.profile_id===user.id),false);
  assert.ok(await repo.getProfileByHandle("jordanreyes",null));
 });
});
