# Categories and income rules

**Categories** page: your list of income, expense and transfer categories. "Add starter list"
fills in a typical studio set plus any category your existing rules already use. It never
changes or removes anything you already have, so it is safe to click again.

**How statements get sorted on import**

1. You drop a statement. Each row's description is checked against your **Rules** (highest
   priority first, first match wins).
2. A matching rule sets the category and kind. No match means `Uncategorized`.
3. Everything lands in **Review** as a suggestion. Nothing is final until you approve it.

**Rules**: pick the category from your list and the kind (income, expense or transfer) follows
it. Income rules only match money coming in, so a payment going *out* that happens to contain
the same words falls through to your other rules. Example: "Acme Productions" → Client
payments (income).

**Review**: the Category box suggests your list as you type and sets the kind when you pick
one. You can still type a new category; add it to the list afterwards if you want it offered.

**Good to know**

- Deleting a category never changes past transactions or rules; they keep the name as text.
- Names are unique per owner, ignoring capitals.
- Migration `006_categories.sql` adds the unique-name index, allows income rules, and adds
  `seed_finance_categories()`. Run it in the Supabase SQL Editor before using the page.
