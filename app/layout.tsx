import Link from "next/link";
import { AuthGate } from "@/lib/auth";
import "./globals.css";
export const metadata = {
  title: "BGP StudioOS",
  description: "Finance and marketing workspace for BGP Studios",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <strong>BGP / StudioOS</strong>
          <nav>
            {[
              ["/", "Dashboard"],
              ["/accounts", "Accounts"],
              ["/import", "Import"],
              ["/review", "Review"],
              ["/rules", "Rules"],
              ["/history", "Imports"],
              ["/reports", "Reports"],
              ["/clients", "Clients"],
              ["/projects", "Projects"],
              ["/invoices", "Invoices"],
              ["/subscriptions", "Subscriptions"],
              ["/assets", "Assets"],
              ["/marketing", "Marketing"],
              ["/login", "Account"],
            ].map(([href, name]) => (
              <Link key={href} href={href}>
                {name}
              </Link>
            ))}
          </nav>
        </header>
        <main>
          <aside>StudioOS · Private Supabase workspace</aside>
          <AuthGate>{children}</AuthGate>
        </main>
      </body>
    </html>
  );
}
