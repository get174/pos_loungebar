import { useEffect, useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { getClosedOrdersForDate, getOrder, getOrderItemsForProductNames } from '../lib/data';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { InvoiceModal } from '../components/InvoiceModal';
import type { Order, OrderItem } from '../types';

function localDate() {
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function ReportsPanel({isOpen,onClose}:{isOpen:boolean;onClose:()=>void}) {
  const {settings}=useSettings();
  const {currentUser}=useAuth();
  const [date,setDate]=useState(localDate);
  const [orders,setOrders]=useState<Order[]>([]);
  const [items,setItems]=useState<OrderItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [receipt,setReceipt]=useState<Order | null>(null);
  const [opening,setOpening]=useState(false);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!isOpen || currentUser?.role!=='admin')return;
    let active=true;setLoading(true);setError('');setOrders([]);setItems([]);
    getClosedOrdersForDate(new Date(date+'T00:00:00')).then(async rows=>{
      const lines=await getOrderItemsForProductNames(rows.map(o=>o.id));
      if(active){setOrders(rows);setItems(lines);}
    }).catch(()=>{if(active)setError('Rapport indisponible. Vérifiez la connexion et réessayez.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[isOpen,date,retry,currentUser?.role]);
  if(!isOpen || currentUser?.role!=='admin')return null;
  const revenue=orders.reduce((sum,o)=>sum+o.total,0);
  const products=new Map<string,{quantity:number;total:number}>();
  for(const item of items){const p=products.get(item.product_name) || {quantity:0,total:0};p.quantity+=item.quantity;p.total+=item.subtotal;products.set(item.product_name,p);}
  const popular=[...products].sort((a,b)=>b[1].total-a[1].total).slice(0,5);
  return <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <section className="bg-slate-800 border border-slate-700 rounded-2xl text-white max-w-5xl w-full h-[85vh] flex flex-col">
      <header className="flex justify-between items-center p-5 border-b border-slate-700">
        <h2 className="text-xl font-bold flex gap-2"><TrendingUp/>Ventes et reçus</h2>
        <button onClick={onClose} aria-label="Fermer les rapports"><X/></button>
      </header>
      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        <label className="block">Journée (heure locale)<input type="date" required value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} className="bg-slate-700 rounded p-2 ml-3"/></label>
        {loading && <p role="status">Chargement…</p>}
        {error && <p role="alert" className="text-red-300">{error} <button className="underline" onClick={()=>setRetry(n=>n+1)}>Réessayer</button></p>}
        {!loading && !error && <>
          <div className="grid grid-cols-3 gap-4">
            {[['Commandes',orders.length.toLocaleString()],['Chiffre d’affaires',`${revenue.toLocaleString()} ${settings.currency}`],['Moyenne',`${Math.round(orders.length?revenue/orders.length:0).toLocaleString()} ${settings.currency}`]].map(([label,value])=><div key={label} className="bg-slate-700 p-4 rounded-xl"><p className="text-slate-300">{label}</p><p className="text-2xl font-bold mt-2">{value}</p></div>)}
          </div>
          <section><h3 className="font-bold mb-3">Produits les plus vendus</h3>{popular.map(([name,stats])=><p key={name} className="flex justify-between p-2 bg-slate-700 mb-1 rounded"><span>{name} × {stats.quantity}</span><span>{stats.total.toLocaleString()} {settings.currency}</span></p>)}{!popular.length && <p className="text-slate-300">Aucune vente pour cette journée.</p>}</section>
          <section><h3 className="font-bold mb-3">Historique des encaissements</h3><div className="space-y-2">{orders.map(order=><div key={order.id} className="flex justify-between items-center bg-slate-700 p-3 rounded gap-4"><div><p>{order.table_name} · {new Date(order.closed_at!).toLocaleTimeString('fr-FR')} · {order.cashier_name}</p><p className="text-xs text-slate-300">{order.id}</p></div><span>{order.total.toLocaleString()} {settings.currency}</span><button disabled={opening} className="underline disabled:opacity-50" onClick={async()=>{setOpening(true);try{setReceipt(await getOrder(order.id));}catch{setError('Reçu indisponible. Réessayez.');}finally{setOpening(false);}}}>Voir / réimprimer</button></div>)}</div></section>
        </>}
      </div>
    </section>
    <InvoiceModal key={receipt?.id} isOpen={Boolean(receipt)} order={receipt} onClose={()=>setReceipt(null)}/>
  </div>;
}
