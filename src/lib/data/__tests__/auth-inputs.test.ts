import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleAge } from "@/lib/age";
import { authCallbackUrl, safeAuthReturn } from "@/lib/auth-return";

test("signup eligibility rejects under13, future, impossible and absent private DOB", () => {
  const today = new Date("2026-09-11T00:00:00Z");
  assert.equal(eligibleAge("2013-09-11", today), true);
  assert.equal(eligibleAge("2013-09-12", today), false);
  assert.equal(eligibleAge("2027-01-01", today), false);
  assert.equal(eligibleAge("2010-02-30", today), false);
  assert.equal(eligibleAge("1900-01-01", today), false);
  assert.equal(eligibleAge(null, today), false);
});
test("verification destination survives confirmation and onboarding without DOB in URLs", () => {
  const next = "/verify/invitation?review=1";
  const onboarding = `/onboarding?next=${encodeURIComponent(safeAuthReturn(next))}`;
  const callback = new URL(authCallbackUrl(onboarding));
  const restored = new URL(callback.searchParams.get("next")!, callback.origin);
  assert.equal(restored.pathname, "/onboarding");
  assert.equal(restored.searchParams.get("next"), next);
  assert.equal(callback.toString().includes("date_of_birth"), false);
  for (const unsafe of ["//evil.example", "/\\evil.example", "https://evil.example", "/\nredirect"]) assert.equal(safeAuthReturn(unsafe), "/app");
});
