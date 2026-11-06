import { Printer, X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from './Modal';
import type { Order } from '../types';
import { useSettings } from '../context/SettingsContext';
import { isAndroid } from '../lib/mobile';

interface InvoiceModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
}

export function InvoiceModal({ isOpen, order, onClose }: InvoiceModalProps) {
  const { settings } = useSettings();
  const [printing,setPrinting]=useState(false);
  const [notice,setNotice]=useState('');
  const print=async()=>{
    if(!order || printing)return;setPrinting(true);setNotice('');
    try{const result=await window.electronAPI.printOrder(order.id);setNotice(result.cancelled?'Impression annulée. Le paiement reste enregistré.':isAndroid?'Dialogue d’impression ouvert. Choisissez une imprimante ou enregistrez le ticket en PDF.':'Ticket envoyé à l’imprimante.');}
    catch{setNotice('Impression impossible. Vérifiez l’imprimante et réessayez. Le paiement reste enregistré.');}
    finally{setPrinting(false);}
  };

  if (!order) return null;

  const items = order.items || [];
  const now = new Date(order.closed_at || order.opened_at);
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal isOpen={isOpen} title="Facture" onClose={onClose} size="sm">
      <div className="receipt bg-white text-black p-6 rounded-lg font-mono text-sm space-y-2 max-h-96 overflow-y-auto" style={{maxWidth:settings.receipt_width==='58'?'58mm':'80mm'}}>
        <div className="text-center border-b border-black pb-2 mb-3">
          <h3 className="font-bold text-lg">{settings.restaurant_name}</h3>
          <p className="text-xs">{settings.address}</p>
          <p className="text-xs">{settings.phone}</p>
        </div>

        <div className="text-center border-b border-black pb-2 mb-3">
          <p className="font-bold">Table: {order.table_name}</p>
          <p className="text-xs">{dateStr} {timeStr}</p>
          <p className="text-xs">Caissier: {order.cashier_name}</p>
        </div>

        <div className="space-y-1 mb-3">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span>{item.product_name} x{item.quantity}</span>
              <span>{item.subtotal.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-black border-b border-double py-2 my-2">
          <div className="flex justify-between font-bold">
            <span>TOTAL:</span>
            <span>{order.total.toLocaleString()} {settings.currency}</span>
          </div>
        </div>

        <div className="text-center text-xs border-t border-black pt-2">
          <p>Reçu : {order.id}</p>
          <p>Reçu client : {order.amount_paid.toLocaleString()} {settings.currency}</p>
          <p>Monnaie : {order.change_due.toLocaleString()} {settings.currency}</p>
          <p>{settings.receipt_footer}</p>
        </div>
      </div>

      {notice && <p role="status" className="text-slate-200 mt-3">{notice}</p>}
      <div className="flex gap-3 mt-6">
        <button
          onClick={print} disabled={printing}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
        >
          <Printer className="w-5 h-5" />
          {printing?'Impression…':'Imprimer'}
        </button>
        <button
          onClick={onClose}
          className="px-6 bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </Modal>
  );
}
