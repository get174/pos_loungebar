import { Plus, Minus, Trash2 } from 'lucide-react';
import type { CartItem } from '../types';
import { useSettings } from '../context/SettingsContext';

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}

export function Cart({ items, onUpdateQuantity, onRemoveItem }: CartProps) {
  const { settings } = useSettings();
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  if (items.length === 0) {
    return (
      <div className="text-center text-slate-400 py-12">
        <p>Panier vide</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.product_id}
            className="bg-slate-700/50 rounded-lg p-3 border border-slate-600"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <p className="font-semibold text-white break-words">{item.product_name}</p>
                <p className="text-sm text-slate-400">
                  {item.unit_price.toLocaleString()} {settings.currency} × {item.quantity}
                </p>
              </div>
              <button
                aria-label={`Retirer ${item.product_name}`}
                onClick={() => onRemoveItem(item.product_id)}
                className="p-2 shrink-0 hover:bg-red-500/20 rounded transition"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-slate-600/50 rounded-lg p-1">
                <button
                  aria-label={`Diminuer ${item.product_name}`}
                  onClick={() =>
                    onUpdateQuantity(item.product_id, Math.max(1, item.quantity - 1))
                  }
                  className="p-2 hover:bg-slate-500 rounded transition"
                >
                  <Minus className="w-4 h-4 text-white" />
                </button>
                <span className="w-8 text-center text-white font-semibold">
                  {item.quantity}
                </span>
                <button
                  aria-label={`Augmenter ${item.product_name}`}
                  onClick={() =>
                    onUpdateQuantity(item.product_id, item.quantity + 1)
                  }
                  className="p-2 hover:bg-slate-500 rounded transition"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="text-blue-400 font-bold">
                {item.subtotal.toLocaleString()} {settings.currency}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-600 pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-white">Total:</span>
          <span className="text-2xl font-bold text-blue-400">
            {total.toLocaleString()} {settings.currency}
          </span>
        </div>
      </div>
    </div>
  );
}
