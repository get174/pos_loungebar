import type { Product } from '../types';

interface ProductButtonProps {
  product: Product;
  onClick: () => void;
}

export function ProductButton({ product, onClick }: ProductButtonProps) {
  return (
    <button
      onClick={onClick}
      className="h-24 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 hover:border-slate-500 hover:shadow-lg transition transform hover:scale-105 active:scale-95 p-3 text-left flex flex-col justify-between"
    >
      <div>
        <h4 className="text-white font-semibold text-sm line-clamp-1">
          {product.name}
        </h4>
      </div>
      <div className="text-blue-400 font-bold text-lg">
        {product.price.toLocaleString()} FC
      </div>
    </button>
  );
}
