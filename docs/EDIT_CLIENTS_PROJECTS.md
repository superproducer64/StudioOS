# Editing and deleting clients and projects

**Clients** and **Projects** pages: each row has **Edit** and **Delete**.

- **Edit** fixes spelling and details in place (client name and email; project name, client and
  budget). Invoices, transactions and reports follow the new name automatically because they
  point at the record, not a copy of the text.
- **Delete** first checks what still uses the record. A client with projects, invoices or a
  marketing brand profile, or a project with tagged transactions, invoices or assets, can't be
  deleted; the message says what is in the way. For projects, set the status to **archived**
  instead. Otherwise you get a confirm step, and deletion can't be undone.
- Nothing about your transactions or invoices is ever deleted by these buttons.

No database migration. Row-level security already limits every edit and delete to your own rows.
