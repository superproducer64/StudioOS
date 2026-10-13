import test from "node:test";
import assert from "node:assert/strict";
import { fromTransactions, parseCategoryList } from "../lib/categories";
test("pasted category lists: types, defaults, repeats and existing names", () => {
  const got = parseCategoryList(
    "Crew & talent\nClient payments, income\nTravel\t expense \n\ncrew & TALENT\nRoyalties, residuals, income\nInterest, bogus\nBank fees",
    "expense",
    ["travel"],
  );
  assert.deepEqual(got, [
    { name: "Crew & talent", kind: "expense" },
    { name: "Client payments", kind: "income" },
    { name: "Royalties, residuals", kind: "income" },
    { name: "Interest, bogus", kind: "expense" },
    { name: "Bank fees", kind: "expense" },
  ]);
});
test("categories from transactions skip Uncategorized and existing, using the most common kind", () => {
  const got = fromTransactions(
    [
      { category: "Travel", kind: "expense" },
      { category: "travel", kind: "expense" },
      { category: "Uncategorized", kind: "expense" },
      { category: "Client payments", kind: "income" },
      { category: "Client payments", kind: "income" },
      { category: "Client payments", kind: "expense" },
      { category: "Meals", kind: "expense" },
    ],
    ["meals"],
  );
  assert.deepEqual(got, [
    { name: "Client payments", kind: "income" },
    { name: "Travel", kind: "expense" },
  ]);
});
test("plus and minus signs work as types in a pasted column", () => {
  assert.deepEqual(parseCategoryList("Sales\t+\nRent\t-\nGifts, Income\nCredit card, fees, -", "transfer"), [
    { name: "Sales", kind: "income" },
    { name: "Rent", kind: "expense" },
    { name: "Gifts", kind: "income" },
    { name: "Credit card, fees", kind: "expense" },
  ]);
});
