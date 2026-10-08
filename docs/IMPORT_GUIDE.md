# Export mapping checklist

Export layouts change across products and accounts. The starter accepts all five sources through column mapping; it does not claim automatic recognition of every export version. Check your actual file against this checklist.

| Source | Map and verify                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Venmo  | Remove any preamble before the header. Map datetime, note/description, signed total, and transaction ID. Verify sent payments are negative and received payments positive. Do not treat balance transfers as sales.                              |
| Square | Choose the account transaction export, rather than assuming a sales report is a bank statement. Map transaction date, description, amount, and ID. Payouts between your own accounts require transfer treatment. Card purchases remain expenses. |
| Bank   | Map posted date, description, signed amount or separate debit/credit fields. Preserve the account name consistently. Do not combine pending and posted versions of the same payment.                                                             |
| Card   | Verify the issuer's sign convention; enable positive-is-expense only if charges are positive and refunds negative. Payments to the card are transfers.                                                                                           |
| PayPal | Select the intended net or gross amount deliberately. Fees need distinct expense entries and must not be counted twice. Cross-currency rows remain separate; no exchange-rate conversion is included.                                            |

1. Start with a synthetic CSV and compare the preview to the source.
2. Check row count, date range, amount signs, currency and total.
3. Map a stable provider ID if available. Repeated identical purchases without IDs may be skipped by the conservative duplicate identity.
4. Correct merchant/category and transfer suggestions in the review queue.
5. Approve only after verifying values; the dashboard includes approved USD rows.

The connected app stores rows in Supabase with owner-only RLS. Existing browser demo data is not loaded or migrated. Start with synthetic records until you complete account-specific browser acceptance testing. Use Import history to reverse or restore a batch without deleting its audit history.
