import Link from 'next/link';
import './globals.css';
export const metadata = {title:'BGP StudioOS',description:'FinanceOS starter for BGP Studios'};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body><header><strong>BGP / StudioOS</strong><nav><Link href="/">Dashboard</Link><Link href="/import">Import</Link><Link href="/review">Review queue</Link><Link href="/foundations">Foundations</Link><Link href="/login">Account</Link></nav></header><main><aside>v0.1 starter · Local demo ledger · Supabase persistence awaits implementation</aside>{children}</main></body></html>; }
