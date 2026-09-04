import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CoachContact, Profile } from "@/lib/database.types";

import { newProfile } from "../local/repository";
import { canRespondToRequest, canSeeCoachContact, canViewProfile, isListed } from "../local/rules";
import type { VerificationRequest } from "../types";

function profile(over: Partial<Profile> = {}): Profile {
  return { ...newProfile({ id: "p1", handle: "athlete", display_name: "A", level: "high_school" }), ...over };
}

const contact: CoachContact = {
  id: "c1", profile_id: "p1", name: "Coach", role: null, org_id: null, org_name: null,
  email: "c@example.org", phone: null, is_visible: true, position: 0, created_at: "",
};

describe("can_view_profile", () => {
  it("public: anyone", () => {
    assert.equal(canViewProfile(profile({ visibility: "public" }), null), true);
  });
  it("unlisted: anyone with the link", () => {
    assert.equal(canViewProfile(profile({ visibility: "unlisted" }), null), true);
  });
  it("private: owner only", () => {
    const p = profile({ visibility: "private" });
    assert.equal(canViewProfile(p, null), false);
    assert.equal(canViewProfile(p, "someone"), false);
    assert.equal(canViewProfile(p, "p1"), true);
  });
  it("staff sees everything", () => {
    const staff = profile({ id: "s", account_kind: "staff" });
    assert.equal(canViewProfile(profile({ visibility: "private" }), "s", staff), true);
  });
  it("suspended resumes are gone to non-owners", () => {
    assert.equal(canViewProfile(profile({ suspended_at: "2026-01-01" }), null), false);
  });
  it("missing profile is never visible", () => {
    assert.equal(canViewProfile(undefined, "p1"), false);
  });
});

describe("listing", () => {
  it("only public athletes are listed", () => {
    assert.equal(isListed(profile({ visibility: "public" })), true);
    assert.equal(isListed(profile({ visibility: "unlisted" })), false);
    assert.equal(isListed(profile({ visibility: "private" })), false);
    assert.equal(isListed(profile({ account_kind: "coach" })), false);
  });
});

describe("coach contacts", () => {
  it("needs public + recruitable + visible", () => {
    assert.equal(canSeeCoachContact(contact, profile({ visibility: "public", is_recruitable: true }), null), true);
    assert.equal(canSeeCoachContact(contact, profile({ visibility: "unlisted", is_recruitable: true }), null), false);
    assert.equal(canSeeCoachContact(contact, profile({ visibility: "public", is_recruitable: false }), null), false);
    assert.equal(
      canSeeCoachContact({ ...contact, is_visible: false }, profile({ visibility: "public", is_recruitable: true }), null),
      false,
    );
  });
  it("the owner always sees their own references", () => {
    assert.equal(canSeeCoachContact(contact, profile({ visibility: "private" }), "p1"), true);
  });
});

describe("verification by link", () => {
  const base: VerificationRequest = {
    id: "r", token: "t", achievement_id: "a", profile_id: "p1", coach_contact_id: "c1",
    status: "pending", note: null, verifier_name: null, verifier_role: null,
    created_at: "", responded_at: null, expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
  it("an anonymous holder of a live link may respond", () => {
    assert.deepEqual(canRespondToRequest(base, null), { ok: true });
  });
  it("the athlete cannot verify their own entry", () => {
    assert.deepEqual(canRespondToRequest(base, "p1"), { ok: false, reason: "self" });
  });
  it("a used link is refused", () => {
    assert.deepEqual(canRespondToRequest({ ...base, status: "verified" }, null), { ok: false, reason: "used" });
  });
  it("an expired link is refused", () => {
    assert.deepEqual(
      canRespondToRequest({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() }, null),
      { ok: false, reason: "expired" },
    );
  });
});
