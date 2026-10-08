export default function Foundations() {
  return (
    <>
      <h1>Studio foundations</h1>
      <p>
        Schema foundations are included; these modules await connected
        workflows.
      </p>
      <div className="grid">
        {[
          ["Clients", "Contacts, billing details and relationships"],
          ["Projects", "Budgets, client links and profitability"],
          ["Invoices", "Invoice numbers, line items and payment status"],
          ["Subscriptions", "Vendors, recurring cost and renewal dates"],
        ].map(([name, detail]) => (
          <section key={name}>
            <h2>{name}</h2>
            <p>{detail}</p>
            <small>Planned for v0.2</small>
          </section>
        ))}
      </div>
    </>
  );
}
