import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, BarChart3 } from 'lucide-react';
import { getFloor, createOrder } from '../lib/data';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { TableCard } from '../components/TableCard';
import { errorMessage } from '../hooks/useOrderDraft';
import { isAndroid, mobileConnectionName } from '../lib/mobile';
import type { RestaurantTable } from '../types';

interface TablesListProps {
  onSelectTable: (table: RestaurantTable) => void;
  onOpenAdmin: () => void;
  onOpenReports: () => void;
}

export function TablesList({
  onSelectTable,
  onOpenAdmin,
  onOpenReports,
}: TablesListProps) {
  const { currentUser, logout } = useAuth();
  const { settings } = useSettings();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const opening=useRef(false);
  const [openingTable,setOpeningTable]=useState(false);
  useEffect(()=>{
    let active=true;let timer: ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try{const floor=await getFloor();if(active){setTables(floor);setError('');}}
      catch{if(active)setError('Connexion PostgreSQL indisponible. Nouvelle tentative automatique.');}
      finally{if(active){setLoading(false);timer=setTimeout(refresh,2000);}}
    };
    void refresh();return()=>{active=false;clearTimeout(timer);};
  },[]);
  const handleTableClick=async(table:RestaurantTable)=>{
    if(table.status==='closed' || opening.current)return;
    opening.current=true;setOpeningTable(true);
    try{const order=await createOrder({table_id:table.id});onSelectTable({...table,current_order:order});}
    catch(error){setError(errorMessage(error));}
    finally{opening.current=false;setOpeningTable(false);}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <p className="text-white text-xl">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1">
            {settings.restaurant_name}
          </h1>
          <p className="text-slate-400">
            Utilisateur: {currentUser?.name} ({currentUser?.role})
          </p>
          {isAndroid && <p className="text-slate-400 text-sm">{mobileConnectionName()}</p>}
        </div>

        <div className="flex gap-3">
          {!isAndroid && currentUser?.role === 'admin' && (
            <>
              <button
                onClick={onOpenReports}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition"
              >
                <BarChart3 className="w-5 h-5" />
                Rapports
              </button>
              <button
                onClick={onOpenAdmin}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition"
              >
                <Settings className="w-5 h-5" />
                Admin
              </button>
            </>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-red-400 mb-4">{error}</p>}
      {/* Tables Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            disabled={openingTable || table.can_edit===false}
            onClick={() => handleTableClick(table)}
          />
        ))}
      </div>

      <p className="text-slate-500 text-sm mt-8 text-center">
        Cliquez sur une table pour prendre commande
      </p>
    </div>
  );
}
