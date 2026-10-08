import test from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { accessToken, fetchPages, fetchSearch, readConfig, signAssertion } from "../lib/google";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  client_email: "reader@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const range = { start: "2026-09-10", end: "2026-10-07" };
const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("the sign-in assertion is a valid RS256 JWT for read-only scopes", () => {
  const jwt = signAssertion(account, 1_000_000);
  const [h, c, s] = jwt.split(".");
  const ok = createVerify("RSA-SHA256")
    .update(h + "." + c)
    .verify(publicKey, Buffer.from(s, "base64url"));
  assert.ok(ok);
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.iss, account.client_email);
  assert.match(claims.scope, /webmasters\.readonly/);
  assert.match(claims.scope, /analytics\.readonly/);
  assert.ok(claims.scope.split(" ").every((x: string) => x.endsWith(".readonly")), "only read-only scopes");
});

test("token exchange and failures are reported plainly", async () => {
  assert.equal(await accessToken(account, reply(200, { access_token: "tok" })), "tok");
  await assert.rejects(accessToken(account, reply(400, {})), /Google sign-in failed/);
});

test("Search Console rows are mapped; a 403 says how to fix access", async () => {
  const seen: { url?: string; body?: string } = {};
  const f = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = String(init.body);
    return new Response(
      JSON.stringify({ rows: [{ keys: ["roof repair", "https://marsroofing.com/"], clicks: 2, impressions: 90, ctr: 0.022, position: 6 }] }),
    );
  }) as unknown as typeof fetch;
  const rows = await fetchSearch("t", "sc-domain:marsroofing.com", range, f);
  assert.deepEqual(rows[0], { query: "roof repair", page: "https://marsroofing.com/", clicks: 2, impressions: 90, ctr: 0.022, position: 6 });
  assert.match(seen.url!, /sc-domain%3Amarsroofing\.com/);
  assert.equal(JSON.parse(seen.body!).startDate, range.start);
  await assert.rejects(fetchSearch("t", "sc-domain:x.com", range, reply(403, {})), /no access.*Add its email/);
});

test("Analytics rows are mapped and the property id must be numeric", async () => {
  const rows = await fetchPages(
    "t",
    "123456789",
    range,
    reply(200, { rows: [{ dimensionValues: [{ value: "/pricing" }], metricValues: [{ value: "210" }, { value: "0.31" }] }] }),
  );
  assert.deepEqual(rows, [{ page: "/pricing", sessions: 210, engagementRate: 0.31 }]);
  await assert.rejects(fetchPages("t", "../../evil", range, reply(200, {})), /numeric/);
});

test("configuration is absent until both variables are set", () => {
  assert.equal(readConfig({}), null);
  assert.equal(readConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }), null);
  const c = readConfig({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(account),
    INSIGHTS_SITES: JSON.stringify([{ profileWebsite: "https://marsroofing.com", ga4: "1234" }]),
  });
  assert.equal(c?.sites.length, 1);
});
