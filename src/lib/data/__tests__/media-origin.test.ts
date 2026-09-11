import assert from "node:assert/strict";
import { test } from "node:test";
import { isMediaRequestSameOrigin } from "../../media-origin";

const request = (origin?: string, host = "127.0.0.1:3000") => new Request("http://localhost:3000/api/media", {
  headers: { host, ...(origin ? { origin } : {}), "x-forwarded-host": "evil.example" },
});

test("development accepts loopback aliases only with matching protocol, port and Host", () => {
  assert.ok(isMediaRequestSameOrigin(request("http://127.0.0.1:3000"), "development"));
  assert.ok(isMediaRequestSameOrigin(request("http://localhost:3000"), "development"));
  for (const origin of [undefined, "null", "https://evil.example", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "http://127.0.0.1:3000/path"]) {
    assert.equal(isMediaRequestSameOrigin(request(origin), "development"), false);
  }
  assert.equal(isMediaRequestSameOrigin(request("http://127.0.0.1:3000", "evil.example"), "development"), false);
});

test("production uses configured HTTPS site origin even behind an internal loopback proxy", () => {
  assert.ok(isMediaRequestSameOrigin(request("https://myroster.us"), "production", "https://myroster.us"));
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "https://evil.example", "https://preview.myroster.us"]) {
    assert.equal(isMediaRequestSameOrigin(request(origin), "production", "https://myroster.us"), false);
  }
  for (const config of [undefined, "not-a-url", "http://myroster.us", "https://user:pass@myroster.us"]) {
    assert.equal(isMediaRequestSameOrigin(request("https://myroster.us"), "production", config), false);
  }
});
