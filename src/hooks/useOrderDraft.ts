import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrder, saveOrder } from '../lib/data';
import type { CartItem, Order } from '../types';

type Draft = {version: number; items: CartItem[]};
const toCart = (order: Order): CartItem[] => (order.items || []).map(item => ({product_id:item.product_id || item.id, product_name:item.product_name, unit_price:item.unit_price, quantity:item.quantity, subtotal:item.subtotal}));
export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('[ORDER_ACCESS]')) return 'Commande réservée à son caissier et à son POS d’origine. Contactez un administrateur.';
  if (message.includes('[CONFLICT]')) return 'Commande modifiée sur une autre caisse. Rechargez-la avant de continuer.';
  if (message.includes('[AUTH]')) return 'Session expirée. Reconnectez-vous ; votre brouillon est conservé.';
  return 'Enregistrement impossible. Le brouillon est conservé sur cet appareil. Vérifiez la connexion puis réessayez.';
}
export function useOrderDraft(orderId: string) {
  const key = `pos-draft:${orderId}`;
  const [order, setOrder] = useState<Order | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const snapshot = useRef<Order | null>(null);
  const currentCart = useRef<CartItem[]>([]);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const pending = useRef<Promise<Order> | null>(null);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const loadSequence = useRef(0);

  const persistDraft = useCallback(() => {
    if (!snapshot.current) return;
    try { localStorage.setItem(key, JSON.stringify({version:snapshot.current.version, items:currentCart.current})); }
    catch { setError('Le stockage de secours est plein ou indisponible. Enregistrez la commande avant de quitter.'); }
  }, [key]);

  const load = useCallback(async (discardDraft = false) => {
    const sequence=++loadSequence.current;
    if (pending.current) await pending.current.catch(() => {});
    const fresh = await getOrder(orderId);
    if(sequence!==loadSequence.current || !mounted.current)return fresh;
    snapshot.current = fresh;
    let items = toCart(fresh);
    let restored = false;
    let stale = false;
    if (fresh.status === 'open' && !discardDraft) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const draft: Draft = JSON.parse(raw);
          if (!Array.isArray(draft.items) || draft.items.some(i => !i || typeof i.product_id!=='string' || !Number.isSafeInteger(i.quantity) || i.quantity <= 0 || !Number.isSafeInteger(i.unit_price) || i.unit_price < 0)) throw new Error('Brouillon invalide');
          items = draft.items.map(i => ({...i, subtotal:i.quantity*i.unit_price})); restored = true; stale = draft.version !== fresh.version;
        }
      } catch { setError('Brouillon illisible. La version enregistrée en base a été chargée.'); }
    }
    if (discardDraft || fresh.status !== 'open') localStorage.removeItem(key);
    currentCart.current=items; revision.current=restored ? 1 : 0; savedRevision.current=0;
    blocked.current=stale;
    if (mounted.current) {
      setOrder(fresh); setCart(items); setDirty(restored); setConflict(stale); setLoaded(true);
      if (stale) setError('Un brouillon local et une version plus récente en base existent. Comparez le panier, puis rechargez la commande pour continuer.');
      else setError('');
    }
    return fresh;
  }, [key, orderId]);

  useEffect(() => {
    mounted.current=true;
    void load().catch(() => { if (mounted.current) setError('Chargement impossible. Vérifiez PostgreSQL et réessayez.'); });
    return () => { mounted.current=false; };
  }, [load]);

  const changeCart = useCallback((update: (items: CartItem[]) => CartItem[]) => {
    if (!snapshot.current || snapshot.current.status!=='open' || blocked.current) return;
    currentCart.current=update(currentCart.current); revision.current++;
    setCart(currentCart.current); setDirty(true); setError(''); setAutosaveFailed(false); persistDraft();
  }, [persistDraft]);

  const flush = useCallback(async (): Promise<Order> => {
    if (pending.current) await pending.current;
    const base=snapshot.current;
    if (!base || blocked.current) throw new Error('[CONFLICT]');
    if (base.status!=='open' || savedRevision.current===revision.current) return base;
    const submittedRevision=revision.current;
    const submittedItems=currentCart.current.map(item => ({...item}));
    setSaving(true); setAutosaveFailed(false);
    const request=saveOrder(base.id, submittedItems, undefined, base.version);
    pending.current=request;
    try {
      const saved=await request;
      snapshot.current=saved; savedRevision.current=submittedRevision;
      if (mounted.current) { setOrder(saved); setDirty(revision.current!==submittedRevision); setError(''); }
      if (revision.current===submittedRevision) {
        currentCart.current=toCart(saved);
        if (mounted.current) setCart(currentCart.current);
        localStorage.removeItem(key);
      } else persistDraft();
      return saved;
    } catch (error) {
      setAutosaveFailed(true);
      if (String(error).includes('[CONFLICT]')) { blocked.current=true; setConflict(true); }
      if (mounted.current) setError(errorMessage(error));
      throw error;
    } finally { pending.current=null; if (mounted.current) setSaving(false); }
  }, [key,persistDraft]);

  useEffect(() => {
    if (!loaded || !dirty || conflict || saving || autosaveFailed) return;
    const timer=setTimeout(() => { void flush().catch(() => {}); }, 600);
    return () => clearTimeout(timer);
  }, [cart,loaded,dirty,conflict,saving,autosaveFailed,flush]);

  useEffect(() => {
    const preventLoss=(event: BeforeUnloadEvent) => {
      if (revision.current!==savedRevision.current) { event.preventDefault(); event.returnValue=''; }
    };
    window.addEventListener('beforeunload',preventLoss);
    return () => window.removeEventListener('beforeunload',preventLoss);
  }, []);

  const complete = useCallback((closed: Order) => {
    snapshot.current=closed; savedRevision.current=revision.current; blocked.current=false;
    localStorage.removeItem(key); setOrder(closed); setCart(toCart(closed));setDirty(false);setConflict(false);setError('');
  }, [key]);
  return {order,cart,loaded,saving,dirty,conflict,error,setError,changeCart,flush,reload:load,complete};
}
