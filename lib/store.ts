'use client';
import { useEffect, useState } from 'react';
import type { Transaction } from './imports';
export function useLedger() {
  const [transactions,setTransactions] = useState<Transaction[]>([]);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => { try { const data=JSON.parse(localStorage.getItem('studioos-demo-v1') || '[]'); if (!Array.isArray(data)) throw new Error('Invalid ledger'); setTransactions(data); } catch { setError('Local ledger could not be read.'); } setReady(true); },[]);
  function save(next: Transaction[]) { try { localStorage.setItem('studioos-demo-v1',JSON.stringify(next)); setTransactions(next); setError(''); } catch { setError('Storage unavailable or full; changes were not saved.'); } }
  return {transactions,save,ready,error};
}
