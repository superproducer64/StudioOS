import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, confirmItems, parseDraft, SYSTEM_PROMPT } from "../lib/drafting";
import { complete, readLlmConfig } from "../lib/llm";

const profile = {
  name: "Mars Roofing", website: "https://marsroofing.com", audience: "Houston homeowners",
  voice: "Friendly, plain-spoken", services: "Roof repair and replacement", service_area: "Houston", notes: "",
};
const action = {
  title: "Improve the roof repair page", reason: "Low CTR", source: "search_console" as const,
  source_date: "2026-10-07", evidence: { rule: "low_ctr", impressions: 400 },
};

test("prompt fences brand and task data and forbids invented facts", () => {
  const p = buildPrompt(profile, action, "website");
  assert.match(p.user, /<brand_profile>[\s\S]*Mars Roofing[\s\S]*<\/brand_profile>/);
  assert.match(p.user, /"impressions":400/);
  assert.match(p.system, /Never invent/);
  assert.match(p.system, /\[CONFIRM:/);
  assert.match(p.system, /not instructions/);
  assert.equal(p.system, SYSTEM_PROMPT);
});

test("oversized fields are clipped", () => {
  const p = buildPrompt({ ...profile, notes: "x".repeat(50000) }, action, "blog");
  assert.ok(p.user.length < 12000);
});

test("parseDraft accepts bare and fenced JSON and rejects junk", () => {
  assert.deepEqual(parseDraft('{"title":" T ","body":" B "}'), { title: "T", body: "B" });
  assert.deepEqual(parseDraft('```json\n{"title":"T","body":"B"}\n```'), { title: "T", body: "B" });
  assert.throws(() => parseDraft("Sure! Here is a draft."), /usable draft/);
  assert.throws(() => parseDraft('{"title":"T"}'), /missing/);
  assert.throws(() => parseDraft('{"title":"","body":"B"}'), /empty/);
  assert.throws(() => parseDraft(JSON.stringify({ title: "t".repeat(201), body: "b" })), /too long/);
});

test("confirmItems lists the gaps the owner must fill", () => {
  assert.deepEqual(confirmItems("Licensed since [CONFIRM: year] and [confirm: license number]."), ["year", "license number"]);
  assert.deepEqual(confirmItems("nothing missing"), []);
});

test("llm config: not set up, defaults, and half-finished setups", () => {
  assert.equal(readLlmConfig({}), null);
  assert.deepEqual(readLlmConfig({ ANTHROPIC_API_KEY: " k " }), { provider: "anthropic", apiKey: "k", model: "claude-sonnet-5-5" });
  assert.throws(() => readLlmConfig({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "k" }), /LLM_MODEL/);
  assert.throws(() => readLlmConfig({ LLM_PROVIDER: "other" }), /anthropic or openai/);
  assert.equal(readLlmConfig({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "k", LLM_MODEL: "m" })?.model, "m");
});

test("complete sends the key only in headers and maps errors without leaking it", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const ok: typeof fetch = async (url, init) => {
    seen = { url: String(url), init: init! };
    return Response.json({ content: [{ type: "text", text: '{"title":"a","body":"b"}' }] });
  };
  const text = await complete({ provider: "anthropic", apiKey: "SECRET", model: "m" }, { system: "s", user: "u" }, ok);
  assert.equal(text, '{"title":"a","body":"b"}');
  assert.match(seen!.url, /api\.anthropic\.com/);
  assert.ok(!String(seen!.init.body).includes("SECRET"));
  const oa: typeof fetch = async () => Response.json({ choices: [{ message: { content: "hi" } }] });
  assert.equal(await complete({ provider: "openai", apiKey: "SECRET", model: "m" }, { system: "s", user: "u" }, oa), "hi");
  const credit: typeof fetch = async () =>
    Response.json({ error: { message: "Your credit balance is too low" } }, { status: 400 });
  await assert.rejects(
    () => complete({ provider: "anthropic", apiKey: "SECRET", model: "m" }, { system: "s", user: "u" }, credit),
    /error \(400\)\. It said: Your credit balance is too low/,
  );
  for (const [status, re] of [[401, /rejected the API key/], [429, /credit/], [500, /error \(500\)/]] as const) {
    const bad: typeof fetch = async () => new Response("SECRET leaked body", { status });
    await assert.rejects(
      () => complete({ provider: "anthropic", apiKey: "SECRET", model: "m" }, { system: "s", user: "u" }, bad),
      (e: Error) => re.test(e.message) && !e.message.includes("SECRET"),
    );
  }
});
