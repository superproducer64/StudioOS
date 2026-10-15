# Finance polish: password reset, account balances, invoice payment matching

**Apply `supabase/migrations/005_finance_polish.sql` first** (Supabase → SQL Editor → paste the file's contents → Run). Without it the Accounts and Invoices pages will show errors for the new data. Password reset needs no migration.

## Password reset
- Login page → enter your email → **Forgot password?**. The message is the same whether or not the email has an account.
- The emailed link brings you back to `/login` to choose a new password.
- One-time Supabase setting: Authentication → URL Configuration → add your app address (for example `http://localhost:3000/login`) to **Redirect URLs**, or the link will be rejected.

## Account balances
- Each account shows a **calculated balance**: opening balance plus every imported, non-reversed transaction on or after the opening date. It is worked out from what you imported, not read from your bank: compare it to a statement.
- Set the opening balance to what the account held at the **start** of the chosen day. For a card you owe money on, enter a negative amount (`-400.00`).
- Transfers count (money really moved). Unreviewed transactions count too; the page says how many are unreviewed. Reversed imports are excluded.

## Matching a bank deposit to an invoice
- On a sent invoice, **Possible bank deposits** lists imported income deposits in the same currency, no larger than the balance and not dated before the invoice was sent. **This paid it** records the deposit as the payment and links the two in one step, so the same deposit cannot be counted twice.
- **Undo match** takes the amount back off the invoice and unlinks the deposit.
- Suggestions are only suggestions; the database re-checks every rule (income, same currency, not reversed, not already matched, not more than the balance).

## Known limits
- Reversing an import that contains a matched deposit does not touch the invoice. The deposit stays listed under the invoice, marked "Import reversed", so you can still **Undo match**.
- A link is not enforced against direct edits of your own data; it is guarded by the screen and the matching functions.
- Not tested live: the password-reset email flow and the Supabase redirect setting. The database logic is covered by `npm run test:db`, the suggestion logic by `npm test`.
