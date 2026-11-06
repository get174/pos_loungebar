import { Users, UtensilsCrossed } from 'lucide-react';
import type { RestaurantTable } from '../types';

interface TableCardProps {
  table: RestaurantTable;
  onClick: () => void;
  disabled?: boolean;
}

export function TableCard({ table, onClick, disabled }: TableCardProps) {
  const statusColor = {
    free: 'from-green-500 to-green-600 border-green-400/30',
    occupied: 'from-red-500 to-red-600 border-red-400/30',
    closed: 'from-slate-600 to-slate-700 border-slate-500/30',
  }[table.status];

  const statusLabel = {
    free: 'Libre',
    occupied: 'Occupée',
    closed: 'Fermée',
  }[table.status];

  const tableLabel = table.name || `Table ${table.id.slice(0, 4)}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled || table.status === 'closed'}
      className={`min-w-0 h-32 rounded-2xl bg-gradient-to-br ${statusColor} border-2 p-3 shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:opacity-50 text-white flex flex-col items-center justify-center gap-2`}
    >
      <div className="flex items-center justify-center gap-2 w-full min-w-0">
        <UtensilsCrossed className="w-5 h-5 shrink-0" />
        <h3 className="min-w-0 text-base sm:text-lg font-bold line-clamp-2 break-words">{tableLabel}</h3>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="bg-white/20 px-2 py-1 rounded-lg">{statusLabel}</span>
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {table.capacity}
        </span>
      </div>
      {table.zone && <span className="text-xs">{table.zone.name}</span>}
      {table.can_edit===false && <span className="text-xs">Réservée à {table.current_order?.cashier_name || 'une autre caisse'}</span>}
    </button>
  );
}
