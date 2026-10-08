import test from "node:test";
import assert from "node:assert/strict";
import { draftTransitions, parseLegacyWorkspace, type DraftStatus } from "../lib/marketing";

test("draft buttons follow the database workflow", () => {
  const to = (s: DraftStatus) => draftTransitions(s).map((t) => t.to);
  assert.deepEqual(to("draft"), ["approved", "archived"]);
  assert.deepEqual(to("approved"), ["draft", "published", "archived"]);
  assert.deepEqual(to("published"), ["archived"]);
  assert.deepEqual(to("archived"), ["draft"]);
  // A draft can never jump straight to published, and nothing leaves published except archive.
  assert.ok(!to("draft").includes("published"));
});

const backup = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    brand: {
      name: "Synthetic Roofing",
      website: "https://example.test",
      audience: "Homeowners",
      voice: "Plainspoken",
      services: "Roof repair",
      notes: "Confirm before publishing",
    },
    priorities: [
      { title: "Confirm the brand profile", reason: "Check details", done: true },
      { title: "Establish the search baseline", reason: "", done: false },
    ],
    drafts: [
      { id: "1", title: "Owner story", body: "Synthetic body", status: "Draft" },
      { id: "2", title: "Service page", body: "Another body", status: "Approved for manual publishing" },
    ],
    ...over,
  });

test("an earlier marketing backup imports with approvals withdrawn and a warning", () => {
  const r = parseLegacyWorkspace(backup());
  assert.equal(r.profile.name, "Synthetic Roofing");
  assert.equal(r.profile.website, "https://example.test");
  assert.equal(r.profile.service_area, "");
  assert.deepEqual(r.actions.map((a) => a.done), [true, false]);
  assert.equal(r.drafts.length, 2);
  assert.ok(r.drafts.every((d) => !("status" in d)), "imported drafts carry no status");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /approve them again/);
});

test("a malformed or oversized backup is rejected before anything is saved", () => {
  assert.throws(() => parseLegacyWorkspace("not json"), /valid JSON/);
  assert.throws(() => parseLegacyWorkspace("[]"), /no brand profile/);
  assert.throws(() => parseLegacyWorkspace(JSON.stringify({ brand: { name: "x" } })), /priorities and drafts/);
  assert.throws(
    () => parseLegacyWorkspace(backup({ brand: { name: "   " } })),
    /Brand name is required/,
  );
  assert.throws(
    () => parseLegacyWorkspace(backup({ drafts: [{ title: "t", body: "x".repeat(50001) }] })),
    /longer than 50000/,
  );
  assert.throws(
    () => parseLegacyWorkspace(backup({ drafts: [{ title: "t", body: "  " }] })),
    /content is required/,
  );
  assert.throws(
    () => parseLegacyWorkspace(backup({ priorities: Array.from({ length: 201 }, () => ({ title: "t" })) })),
    /more than 200/,
  );
  assert.throws(() => parseLegacyWorkspace(backup({ brand: { name: 42 } })), /must be text/);
});

test("a website that is not an http(s) address is dropped with a warning, not saved", () => {
  const r = parseLegacyWorkspace(
    backup({ brand: { name: "Synthetic Roofing", website: "javascript:alert(1)" }, drafts: [] }),
  );
  assert.equal(r.profile.website, null);
  assert.match(r.warnings.join(" "), /website/);
});
