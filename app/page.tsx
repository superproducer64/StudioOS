'use client';
import { useLedger } from '@/lib/store';
export default function Dashboard() {
 const {transactions,ready,error}=useLedger();
 const booked=transactions.filter(t=>t.reviewed && t.currency==='USD' && t.kind!=='transfer');
 const income=booked.filter(t=>t.kind==='income').reduce((s,t)=>s+t.amountCents,0);
 const expense=booked.filter(t=>t.kind==='expense').reduce((s,t)=>s+Math.abs(t.amountCents),0);
 const dollars=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
 return <><h1>FinanceOS</h1><p>Your studio finances, ready for review.</p>{error && <p className="error">{error}</p>}<div className="grid">{[['Reviewed income',dollars(income)],['Reviewed expenses',dollars(expense)],['Net activity',dollars(income-expense)],['Needs review',String(transactions.filter(t=>!t.reviewed).length)]].map(([name,value])=><section key={name}><small>{name}</small><div className="metric">{ready?value:'…'}</div></section>)}</div><section><h2>Ledger summary</h2><p>{transactions.length} imported transactions. Totals cover all imported dates, reviewed USD activity only; transfers are excluded. These are transaction summaries, not reconciled P&amp;L or cash flow.</p><p>{transactions.filter(t=>t.currency!=='USD').length} non-USD transactions excluded from totals.</p></section></>;
}
