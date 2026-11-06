import { useEffect, useState } from 'react';
import { isAndroid, hasMobileConnection } from './lib/mobile';
import { PosSetup } from './pages/PosSetup';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { TablesList } from './pages/TablesList';
import { OrderScreen } from './pages/OrderScreen';
import { AdminPanel } from './pages/AdminPanel';
import { ReportsPanel } from './pages/ReportsPanel';
import type { RestaurantTable } from './types';

function AppContent() {
  const { currentUser, isLoading } = useAuth();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showReports, setShowReports] = useState(false);
  useEffect(()=>{setSelectedTable(null);setShowAdmin(false);setShowReports(false);},[currentUser?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <p className="text-white text-xl">Chargement...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }
  if(currentUser.must_change_password)return <ChangePassword/>;

  if (selectedTable) {
    return (
      <OrderScreen
        table={selectedTable}
        onBack={() => setSelectedTable(null)}
      />
    );
  }

  return (
    <>
      <TablesList
        onSelectTable={setSelectedTable}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenReports={() => setShowReports(true)}
      />
      {currentUser.role==='admin' && <AdminPanel isOpen={showAdmin} onClose={() => setShowAdmin(false)} />}
      {currentUser.role==='admin' && <ReportsPanel isOpen={showReports} onClose={() => setShowReports(false)} />}
    </>
  );
}

function App() {
  const [connected,setConnected]=useState(hasMobileConnection);
  const [deviceBlocked,setDeviceBlocked]=useState(false);
  useEffect(()=>{
   const revoked=()=>setDeviceBlocked(true);
   window.addEventListener('pos-device-revoked',revoked);
   return ()=>window.removeEventListener('pos-device-revoked',revoked);
  },[]);
  if(isAndroid && deviceBlocked)return <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6"><div className="max-w-md space-y-5"><h1 className="text-2xl font-bold">POS désactivé</h1><p>Demandez à l’administrateur de réactiver cette caisse dans l’application Windows. Son association et ses commandes sont conservées.</p><button className="bg-blue-600 rounded-lg px-4 py-3" onClick={()=>window.location.reload()}>Réessayer après réactivation</button></div></main>;
  if(isAndroid && !connected)return <PosSetup onReady={()=>setConnected(true)}/>;
  return (
    <SettingsProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
