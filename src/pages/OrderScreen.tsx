import { useEffect, useState } from 'react';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { getCategories, getProducts, getOrder, saveOrder, cancelOrder } from '../lib/data';
import { useOrderDraft, errorMessage } from '../hooks/useOrderDraft';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Cart } from '../components/Cart';
import { InvoiceModal } from '../components/InvoiceModal';
import { Modal } from '../components/Modal';
import type { RestaurantTable, Category, Product } from '../types';

interface OrderScreenProps {
  table: RestaurantTable;
  onBack: () => void;
}

export function OrderScreen({ table, onBack }: OrderScreenProps) {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const orderId=table.current_order!.id;
  const {order:currentOrder,cart,loaded,saving,dirty,conflict,error,setError,changeCart,flush,reload,complete}=useOrderDraft(orderId);
  const [showInvoice,setShowInvoice]=useState(false);
  const [showPayment,setShowPayment]=useState(false);
  const [amountPaid,setAmountPaid]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmReload,setConfirmReload]=useState(false);
  const [showCancel,setShowCancel]=useState(false);
  const [cancelReason,setCancelReason]=useState('');
  const [catalogError,setCatalogError]=useState('');
  const [catalogRetry,setCatalogRetry]=useState(0);

  useEffect(()=>{
    let active=true;
    getCategories().then(data=>{if(active){setCategories(data);setSelectedCategory(previous=>previous || data[0]?.id || null);setCatalogError('');}}).catch(()=>{if(active)setCatalogError('Catalogue indisponible. Réessayez.');});
    return ()=>{active=false;};
  },[catalogRetry]);
  useEffect(()=>{
    let active=true;setProducts([]);
    if(selectedCategory) getProducts(selectedCategory).then(data=>{if(active){setProducts(data);setCatalogError('');}}).catch(()=>{if(active)setCatalogError('Produits indisponibles. Réessayez.');});
    return ()=>{active=false;};
  },[selectedCategory,catalogRetry]);

  const addToCart=(product:Product)=>changeCart(items=>{
    const existing=items.find(i=>i.product_id===product.id);
    return existing ? items.map(i=>i.product_id===product.id ? {...i,quantity:i.quantity+1,subtotal:(i.quantity+1)*i.unit_price} : i) : [...items,{product_id:product.id,product_name:product.name,unit_price:product.price,quantity:1,subtotal:product.price}];
  });
  const updateQuantity=(id:string,quantity:number)=>{if(Number.isSafeInteger(quantity) && quantity>0) changeCart(items=>items.map(i=>i.product_id===id ? {...i,quantity,subtotal:quantity*i.unit_price}:i));};
  const removeItem=(id:string)=>changeCart(items=>items.filter(i=>i.product_id!==id));
  const handleBack=async()=>{
    if(busy)return;setBusy(true);
    try{await flush();onBack();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };
  const handleCloseOrder=async()=>{
    if(!currentOrder || busy || !cart.length)return;setBusy(true);setError('');
    try{
      const saved=await flush();
      const paid=await saveOrder(orderId,cart,Number(amountPaid),saved.version);
      complete(paid);setShowPayment(false);setShowInvoice(true);
    }catch(e){
      // A response may have been lost after COMMIT. Read the authoritative state before offering another payment.
      try{const fresh=await getOrder(orderId);if(fresh.status==='closed'){complete(fresh);setShowPayment(false);setShowInvoice(true);}else setError(errorMessage(e));}
      catch{setError('Paiement non confirmé. Vérifiez la connexion, puis réessayez pour contrôler son état.');}
    }finally{setBusy(false);}
  };
  const handleCancel=async()=>{
    if(busy || !currentOrder)return;setBusy(true);
    try{const saved=await flush();await cancelOrder(orderId,saved.version,cancelReason);await reload(true);onBack();}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  };

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const changeDue = Number(amountPaid || '0') - total;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Table: {table.name}</h1>
          <p className="text-slate-400">Caissier: {currentUser?.name}</p>
        </div>
        <button
          onClick={handleBack} disabled={busy || !loaded || conflict}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
            Enregistrer et revenir
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-3 text-sm text-slate-300 items-center">
        <span role="status">{!loaded ? 'Chargement de la commande…' : saving ? 'Enregistrement…' : dirty ? 'Brouillon local — enregistrement en attente' : 'Commande enregistrée'}</span>
        <button onClick={()=>{if(loaded)setConfirmReload(true);else void reload().catch(()=>setError('Chargement impossible. Réessayez.'));}} disabled={busy || saving} className="underline">Recharger la commande</button>
        {currentOrder?.status==='closed' && <button className="underline" onClick={()=>setShowInvoice(true)}>Afficher le reçu</button>}
        {currentOrder?.status==='open' && <button disabled={busy || conflict || !loaded} onClick={()=>setShowCancel(true)} className="text-red-300 underline">Annuler la commande</button>}
      </div>
      {catalogError && <p className="text-amber-300">{catalogError} <button className="underline" onClick={()=>setCatalogRetry(n=>n+1)}>Réessayer</button></p>}
      {error && <p role="alert" className="bg-red-900 text-white p-3 mb-3">{error}</p>}
      <fieldset disabled={busy || !loaded || conflict || currentOrder?.status !== 'open'} className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)] gap-3 md:h-[calc(100dvh-180px)] md:min-h-[360px]">
        {/* Products Section */}
        <div className="min-w-0 min-h-0 flex flex-col">
          {/* Category Tabs */}
          <div className="flex shrink-0 gap-2 mb-3 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
                style={
                  selectedCategory === cat.id
                    ? { backgroundColor: cat.color, color: 'white' }
                    : {}
                }
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] auto-rows-[80px] content-start gap-2 flex-1 min-h-0 max-h-[45dvh] md:max-h-none overflow-y-auto pr-1 pb-2">
            {products.map((product) => (
              <button
                key={product.id}
                title={`${product.name} — ${product.price.toLocaleString()} ${settings.currency}`}
                onClick={() => addToCart(product)}
                className="min-w-0 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border border-slate-600 hover:border-slate-500 rounded-lg p-2 text-left transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 flex flex-col justify-between h-20"
              >
                <h4 className="text-white font-semibold text-xs leading-4 line-clamp-2 break-words">
                  {product.name}
                </h4>
                <p className="text-blue-400 font-bold text-sm leading-5">
                  {product.price.toLocaleString()} {settings.currency}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Cart Section */}
        <div className="min-h-0 min-w-0 bg-slate-800 rounded-2xl border border-slate-700 p-3 sm:p-4 flex flex-col shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-600 pb-4">
            Panier
          </h2>

          <div className="flex-1 overflow-y-auto mb-4">
            <Cart
              items={cart}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeItem}
            />
          </div>

          <button
            onClick={() => {setAmountPaid('');setShowPayment(true);}}
            disabled={cart.length === 0 || saving}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold py-4 rounded-lg transition transform hover:scale-105 active:scale-95 disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg"
          >
            <DollarSign className="w-5 h-5" />
            Clôturer ({total.toLocaleString()} {settings.currency})
          </button>
        </div>
      </fieldset>

      {/* Payment Modal */}
      <Modal
        isOpen={showPayment}
        title="Paiement"
        onClose={() => {if(!busy)setShowPayment(false);}}
      >
        <div className="space-y-6">
          {error && <p role="alert" className="text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-bold text-slate-200 mb-2">
              Total à payer
            </label>
            <input
              type="text"
              disabled
              value={`${total.toLocaleString()} ${settings.currency}`}
              className="w-full px-4 py-3 bg-slate-100 border border-slate-300 rounded-lg text-lg font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-200 mb-2">
              Montant donné par le client
            </label>
            <input
              type="number"
              min={0} max={2147483647} step={1} disabled={busy}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>

          {amountPaid && (
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                {changeDue < 0 ? 'Montant manquant' : 'Monnaie à rendre'}
              </label>
              <input
                type="text"
                disabled
                value={`${Math.abs(changeDue).toLocaleString()} ${settings.currency}`}
                className={`w-full px-4 py-3 border rounded-lg text-lg font-bold ${
                  changeDue >= 0
                    ? 'bg-green-100 border-green-300 text-green-900'
                    : 'bg-red-100 border-red-300 text-red-900'
                }`}
              />
            </div>
          )}

          <button
            onClick={handleCloseOrder}
            disabled={busy || saving || conflict || !amountPaid || !Number.isSafeInteger(Number(amountPaid)) || Number(amountPaid) < total}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold py-3 rounded-lg transition"
          >
            Procéder au paiement
          </button>
        </div>
      </Modal>

      <Modal isOpen={confirmReload} title="Recharger la commande" onClose={()=>setConfirmReload(false)}>
        <p className="text-slate-200 mb-4">Les modifications locales non enregistrées seront remplacées par la version en base.</p>
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded" onClick={async()=>{setBusy(true);try{await reload(true);setConfirmReload(false);}catch{setError('Rechargement impossible.');}finally{setBusy(false);}}}>Charger la version enregistrée</button>
      </Modal>
      <Modal isOpen={showCancel} title="Annuler la commande" onClose={()=>{if(!busy)setShowCancel(false);}}>
        <p className="text-slate-200 mb-3">La table sera libérée. L’annulation sera conservée dans le journal.</p>
        <label className="text-white block">Motif<input maxLength={500} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} className="block w-full p-2 text-slate-900 rounded mt-2" /></label>
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button disabled={busy || !cancelReason.trim()} onClick={handleCancel} className="mt-4 bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50">Confirmer l’annulation</button>
      </Modal>
      {/* Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoice}
        order={currentOrder}
        onClose={() => {
          setShowInvoice(false);
          setShowPayment(false);
          onBack();
        }}
      />
    </div>
  );
}
