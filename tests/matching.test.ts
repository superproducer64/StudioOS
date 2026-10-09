import test from "node:test";
import assert from "node:assert/strict";
import { suggestDeposits, type Deposit, type MatchableInvoice } from "../lib/matching";
import { parseSignedCents } from "../lib/reports";

const inv: MatchableInvoice = {
  status: "sent", currency: "USD", issued_on: "2026-10-01", total_cents: 100000, amount_paid_cents: 20000,
};
const dep = (o: Partial<Deposit>): Deposit => ({
  id: "d", date: "2026-10-05", description: "x", amountCents: 1000, currency: "USD", kind: "income", invoiceId: null, ...o,
});

test("suggestions keep only deposits that could really have paid the invoice", () => {
  const s = suggestDeposits(inv, [
    dep({ id: "ok-exact", amountCents: 80000 }),
    dep({ id: "ok-part", amountCents: 30000, date: "2026-10-09" }),
    dep({ id: "too-big", amountCents: 80001 }),
    dep({ id: "before-sent", date: "2026-09-30", amountCents: 500 }),
    dep({ id: "wrong-currency", currency: "EUR" }),
    dep({ id: "expense", kind: "expense", amountCents: -500 }),
    dep({ id: "negative", amountCents: -1 }),
    dep({ id: "zero", amountCents: 0 }),
    dep({ id: "taken", invoiceId: "other" }),
  ]);
  assert.deepEqual(s.map((x) => x.deposit.id), ["ok-exact", "ok-part"]);
  assert.equal(s[0].exact, true);
  assert.equal(s[1].exact, false);
});

test("exact matches rank first, then newest; capped at the limit", () => {
  const many = Array.from({ length: 8 }, (_, i) => dep({ id: "p" + i, amountCents: 100 + i, date: "2026-10-0" + (i + 1) }));
  const s = suggestDeposits(inv, [...many, dep({ id: "exact", amountCents: 80000, date: "2026-10-01" })], 3);
  assert.equal(s.length, 3);
  assert.equal(s[0].deposit.id, "exact");
  assert.equal(s[1].deposit.id, "p7");
});

test("no suggestions for invoices that cannot take a payment", () => {
  const d = [dep({ amountCents: 100 })];
  for (const status of ["draft", "paid", "void"]) assert.deepEqual(suggestDeposits({ ...inv, status }, d), []);
  assert.deepEqual(suggestDeposits({ ...inv, amount_paid_cents: 100000 }, d), []);
  assert.equal(suggestDeposits({ ...inv, issued_on: null }, [dep({ date: "2020-01-01" })]).length, 1);
});

test("signed amounts: owed card balances are negative, junk is rejected", () => {
  assert.equal(parseSignedCents("2,500.50"), 250050);
  assert.equal(parseSignedCents("-400"), -40000);
  assert.equal(parseSignedCents("- 400.5"), -40050);
  assert.equal(parseSignedCents("0"), 0);
  assert.equal(parseSignedCents("-0"), 0);
  for (const bad of ["", "-", "abc", "1.234", "--5", "5-"]) assert.equal(parseSignedCents(bad), null);
});
