import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Pencil, Archive, RefreshCw } from 'lucide-react';
import { archiveEntity, backupNow, getAdminData, getBackupStatus, getSettings, saveEntity, saveSettings, getPosServerInfo, setDeviceActive } from '../lib/data';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/Modal';
import { ReportsPanel } from './ReportsPanel';
import type { AdminData, AdminEntity, BackupStatus, Settings } from '../types';

interface Props {isOpen: boolean; onClose: () => void;}
type Tab = AdminEntity | 'settings' | 'logs' | 'backups' | 'devices';
type RecordForm = {
  id?: string; name: string; username?: string; password?: string; role?: string; is_active?: boolean | number;
  price?: number; category_id?: string | null; is_favorite?: boolean | number;
  color?: string; icon?: string; sort_order?: number; zone_id?: string | null; capacity?: number; status?: string;
};
const labels: Record<Tab,string> = {users:'Utilisateurs',products:'Produits',categories:'Catégories',tables:'Tables',zones:'Zones',settings:'Paramètres',logs:'Journal',backups:'Sauvegardes',devices:'POS Android'};
const emptyData: AdminData = {users:[],products:[],categories:[],tables:[],zones:[],logs:[],devices:[]};
const inputClass = 'block w-full mt-1 rounded-lg border border-slate-500 bg-white text-slate-900 px-3 py-2';
function message(error: unknown) {
  const raw=error instanceof Error ? error.message : '';
  if(raw.includes('23505')) return 'Cet identifiant existe déjà.';
  if(raw.includes('[AUTH]')) return 'Session expirée. Reconnectez-vous.';
  // Electron prepends its invocation context to application errors.
  const cleaned=raw.replace(/^Error invoking remote method '[^']+': Error: /,'');
  if(cleaned && !/ECONN|timeout|connect|password authentication|relation |syntax|column |constraint/i.test(cleaned)) return cleaned;
  return 'Opération impossible. Vérifiez les informations et la connexion PostgreSQL.';
}
export function AdminPanel({isOpen,onClose}: Props) {
  const {settings,refreshSettings}=useSettings();
  const {currentUser}=useAuth();
  const [tab,setTab]=useState<Tab>('products');
  const [data,setData]=useState<AdminData>(emptyData);
  const [form,setForm]=useState<RecordForm | null>(null);
  const [archive,setArchive]=useState<RecordForm | null>(null);
  const [configuration,setConfiguration]=useState<Settings>(settings);
  const [backup,setBackup]=useState<BackupStatus | null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [reports,setReports]=useState(false);
  const [search,setSearch]=useState('');
  const [serverInfo,setServerInfo]=useState<Awaited<ReturnType<typeof getPosServerInfo>>|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const [snapshot,configured,status]=await Promise.all([getAdminData(),getSettings(),getBackupStatus()]);
      setData(snapshot);setConfiguration({...settings,...configured} as Settings);setBackup(status);setError('');
    } catch(e){setError(message(e));} finally{setLoading(false);}
  },[settings]);
  useEffect(()=>{if(isOpen && currentUser?.role==='admin')void load();},[isOpen,currentUser?.role,load]);

  if(!isOpen || currentUser?.role!=='admin')return null;
  const entity=tab in emptyData && tab!=='logs' && tab!=='devices' ? tab as AdminEntity : null;
  const edit=(row?: RecordForm)=>{
    setError('');setNotice('');
    setForm(row ? {...row,password:''} : {name:'',username:'',password:'',role:'cashier',is_active:true,is_favorite:false,price:0,category_id:data.categories.find(c=>c.is_active)?.id || '',color:'#0ea5e9',icon:'cup',sort_order:0,zone_id:data.zones[0]?.id || '',capacity:4,status:'free'});
  };
  const update=(field: keyof RecordForm,value: string | number | boolean)=>setForm(previous=>previous ? {...previous,[field]:value} : previous);
  const submit=async(event: React.FormEvent)=>{
    event.preventDefault();if(!entity || !form || busy)return;setBusy(true);setError('');
    try{await saveEntity(entity,form);setForm(null);await load();setNotice('Modifications enregistrées.');}
    catch(e){setError(message(e));}finally{setBusy(false);}
  };
  const confirmArchive=async()=>{
    if(!entity || !archive?.id || busy)return;setBusy(true);setError('');
    try{await archiveEntity(entity,archive.id);setArchive(null);await load();setNotice('Opération enregistrée.');}
    catch(e){setError(message(e));}finally{setBusy(false);}
  };
  const list: RecordForm[]=entity ? data[entity] : [];
  const settingsSubmit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{await saveSettings(configuration);await refreshSettings();setNotice('Paramètres enregistrés.');}
    catch(e){setError(message(e));}finally{setBusy(false);}
  };
  return <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4">
    <section className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-6xl h-[85vh] flex flex-col text-white">
      <header className="flex justify-between items-center px-6 py-4 border-b border-slate-700">
        <h2 className="text-2xl font-bold">Administration</h2>
        <div className="flex gap-4 items-center">
          <button onClick={()=>setReports(true)} className="underline">Ventes et reçus</button>
          <button onClick={()=>void load()} disabled={loading || busy} aria-label="Actualiser"><RefreshCw className={loading ? 'animate-spin' : ''}/></button>
          <button onClick={onClose} aria-label="Fermer l’administration"><X/></button>
        </div>
      </header>
      <nav className="flex overflow-x-auto gap-2 p-4 border-b border-slate-700" aria-label="Gestion">
        {(Object.keys(labels) as Tab[]).map(key=><button key={key} disabled={busy} onClick={()=>{setTab(key);setSearch('');setError('');setNotice('');}} className={`rounded-lg px-4 py-2 whitespace-nowrap ${tab===key?'bg-blue-600':'bg-slate-700'}`}>{labels[key]}</button>)}
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {error && <p role="alert" className="mb-4 text-red-300">{error}</p>}
        {notice && <p role="status" className="mb-4 text-green-300">{notice}</p>}
        {loading && <p role="status" className="mb-4 text-slate-300">Actualisation…</p>}
        {entity && <>
          <div className="flex gap-4 mb-5">
            <button disabled={busy || loading} onClick={()=>edit()} className="flex gap-2 items-center bg-green-600 px-4 py-2 rounded-lg"><Plus size={18}/>Ajouter</button>
            <input aria-label="Rechercher" placeholder="Rechercher par nom…" value={search} onChange={e=>setSearch(e.target.value)} className="rounded-lg bg-slate-700 px-3 py-2 flex-1"/>
          </div>
          {!list.length && <p className="text-slate-300">Aucun élément. Utilisez Ajouter pour commencer.</p>}
          <div className="space-y-2">{list.filter(row=>(row.name+' '+(row.username||'')).toLowerCase().includes(search.toLowerCase())).map(row=>{
            const inactive=row.is_active!==undefined && !row.is_active || row.status==='closed';
            return <div key={row.id} className="flex items-center justify-between rounded-lg bg-slate-700 p-4 gap-4">
              <div><p className="font-semibold">{row.name} {inactive && <span className="text-amber-300 text-sm">— Inactif</span>}</p>
                {entity==='users' && <p className="text-sm text-slate-300">{row.username} · {row.role==='admin'?'Administrateur':'Caissier'}</p>}
                {entity==='products' && <p className="text-blue-300">{row.price?.toLocaleString()} {settings.currency} · {data.categories.find(c=>c.id===row.category_id)?.name || 'Sans catégorie'}</p>}
                {entity==='tables' && <p className="text-sm text-slate-300">{data.zones.find(z=>z.id===row.zone_id)?.name} · {row.capacity} places · {row.status==='occupied'?'Occupée':row.status==='closed'?'Hors service':'Libre'}</p>}
              </div>
              <div className="flex gap-3"><button disabled={busy} onClick={()=>edit(row)} aria-label={`Modifier ${row.name}`} className="p-2 hover:bg-blue-600 rounded"><Pencil size={18}/></button>
                {!inactive && <button disabled={busy || row.id===currentUser.id} onClick={()=>{setArchive(row);setError('');}} aria-label={`Désactiver ${row.name}`} className="p-2 hover:bg-red-700 rounded disabled:opacity-30"><Archive size={18}/></button>}
              </div>
            </div>;
          })}</div>
        </>}
        {tab==='settings' && <form onSubmit={settingsSubmit} className="max-w-2xl space-y-4">
          {([['restaurant_name','Nom de l’établissement'],['currency','Devise'],['address','Adresse'],['phone','Téléphone'],['receipt_footer','Pied de ticket']] as const).map(([key,label])=><label key={key} className="block">{label}<input required={key==='restaurant_name'||key==='currency'} maxLength={key==='currency'?12:300} value={configuration[key]} onChange={e=>setConfiguration({...configuration,[key]:e.target.value})} className={inputClass}/></label>)}
          <label className="block">Largeur du ticket<select value={configuration.receipt_width} onChange={e=>setConfiguration({...configuration,receipt_width:e.target.value as '58'|'80'})} className={inputClass}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
          <button disabled={busy} className="bg-blue-600 px-4 py-2 rounded disabled:opacity-50">Enregistrer les paramètres</button>
        </form>}
        {tab==='devices' && <div className="space-y-4">
          <p>Les caisses Android utilisent les mêmes produits, tables et commandes. Chaque commande reste réservée à son caissier et à son POS ; vous pouvez intervenir depuis Windows.</p>
          <button className="bg-blue-600 px-4 py-2 rounded" onClick={async()=>{if(serverInfo){setServerInfo(null);return;}try{setServerInfo(await getPosServerInfo());}catch(error){setError(message(error));}}}>{serverInfo?'Masquer le code':'Afficher les informations d’association'}</button>
          {serverInfo && <div className="bg-slate-700 rounded p-4 space-y-2">
            <p>Adresses locales possibles : {serverInfo.urls.join(' ou ') || 'Réseau local indisponible'}</p>
            <p className="break-all">Code d’association : <code className="select-all">{serverInfo.pairingKey || 'Serveur non configuré'}</code></p>
            {serverInfo.host==='127.0.0.1' && <p className="text-amber-300">Le serveur est configuré pour ce PC uniquement. Configurez son adresse réseau avant de connecter une caisse Android.</p>}
            <p className="text-sm text-slate-300">Le serveur doit être démarré sur ce PC. Utilisez votre adresse HTTPS pour une installation de production.</p>
          </div>}
          {!data.devices.length && <p className="text-slate-300">Aucune caisse Android associée.</p>}
          {data.devices.map(device=><div key={device.id} className="flex flex-wrap justify-between gap-3 bg-slate-700 rounded p-4">
            <div><p className="font-semibold">{device.name} · {device.is_active?'Active':'Désactivée'}</p><p className="text-sm text-slate-300">{device.id}</p></div>
            <button disabled={busy} className="px-4 py-2 bg-slate-600 rounded disabled:opacity-50" onClick={async()=>{setBusy(true);setError('');try{await setDeviceActive(device.id,!device.is_active);await load();setNotice('Accès du POS mis à jour.');}catch(error){setError(message(error));}finally{setBusy(false);}}}>{device.is_active?'Désactiver':'Réactiver'}</button>
          </div>)}
        </div>}
        {tab==='logs' && <><p className="text-slate-300 mb-4">100 dernières actions : paiements, annulations et administration.</p><div className="space-y-2">{data.logs.map(log=><div key={log.id} className="bg-slate-700 rounded p-3"><p>{new Date(log.created_at).toLocaleString('fr-FR')} · {log.username || 'Système'} · {log.action}</p><p className="text-sm text-slate-300 break-words">{log.details}</p></div>)}</div></>}
        {tab==='backups' && <div className="space-y-4 max-w-3xl">
          <p>Une sauvegarde PostgreSQL est créée chaque jour au démarrage ou pendant l’utilisation de la caisse. Les sauvegardes locales ne protègent pas contre la perte du disque : copiez-les régulièrement sur un autre support.</p>
          <p className="break-all text-slate-300">Dossier : {backup?.directory}</p>
          <p className="break-all">Dernière sauvegarde automatique : {backup?.lastFile || (backup?.running?'En cours…':'Aucune')}</p>
          {backup?.lastError && <p role="alert" className="text-red-300">{backup.lastError}</p>}
          <button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const destination=await backupNow();if(destination)setNotice(`Sauvegarde créée : ${destination}`);setBackup(await getBackupStatus());}catch(e){setError(message(e));}finally{setBusy(false);}}} className="bg-blue-600 px-4 py-2 rounded">Créer une sauvegarde sur un support choisi</button>
        </div>}
      </div>
    </section>
    <Modal isOpen={Boolean(form)} title={`${form?.id?'Modifier':'Ajouter'} — ${labels[tab]}`} onClose={()=>{if(!busy)setForm(null);}} size="lg">
      {form && entity && <form onSubmit={submit} className="space-y-4 text-white max-h-[65vh] overflow-y-auto pr-2">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Nom<input required maxLength={120} value={form.name} onChange={e=>update('name',e.target.value)} className={inputClass}/></label>
          {entity==='users' && <>
            <label className="block">Identifiant<input required pattern="[a-zA-Z0-9._-]{3,64}" value={form.username || ''} onChange={e=>update('username',e.target.value)} className={inputClass}/></label>
            <label className="block">{form.id?'Nouveau mot de passe (laisser vide pour conserver)':'Mot de passe'}<input type="password" autoComplete="new-password" required={!form.id} minLength={10} maxLength={1024} value={form.password || ''} onChange={e=>update('password',e.target.value)} className={inputClass}/></label>
            <label className="block">Rôle<select value={form.role} onChange={e=>update('role',e.target.value)} className={inputClass}><option value="cashier">Caissier</option><option value="admin">Administrateur</option></select></label>
          </>}
          {entity==='products' && <>
            <label className="block">Prix<input required type="number" min={0} max={2147483647} step={1} value={form.price} onChange={e=>update('price',Number(e.target.value))} className={inputClass}/></label>
            <label className="block">Catégorie<select required value={form.category_id || ''} onChange={e=>update('category_id',e.target.value)} className={inputClass}><option value="">Choisir…</option>{data.categories.filter(c=>c.is_active || c.id===form.category_id).map(c=><option key={c.id} value={c.id}>{c.name}{!c.is_active?' (inactive)':''}</option>)}</select></label>
            <label className="flex gap-2"><input type="checkbox" checked={Boolean(form.is_favorite)} onChange={e=>update('is_favorite',e.target.checked)}/>Favori</label>
          </>}
          {(entity==='categories'||entity==='zones') && <label className="block">Couleur<input type="color" value={form.color} onChange={e=>update('color',e.target.value)} className="block w-20 h-10 mt-1"/></label>}
          {entity==='tables' && <>
            <label className="block">Zone<select required value={form.zone_id || ''} onChange={e=>update('zone_id',e.target.value)} className={inputClass}><option value="">Choisir…</option>{data.zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
            <label className="block">Places<input required type="number" min={1} max={1000} step={1} value={form.capacity} onChange={e=>update('capacity',Number(e.target.value))} className={inputClass}/></label>
            <label className="block">État<select value={form.status} onChange={e=>update('status',e.target.value)} className={inputClass}><option value="free">Libre</option><option value="closed">Hors service</option>{form.status==='occupied' && <option value="occupied">Occupée</option>}</select></label>
          </>}
          {(entity==='tables'||entity==='products'||entity==='categories') && <label className="block">Ordre d’affichage<input type="number" min={0} step={1} value={form.sort_order || 0} onChange={e=>update('sort_order',Number(e.target.value))} className={inputClass}/></label>}
          {(entity==='users'||entity==='products'||entity==='categories') && <label className="flex gap-2"><input type="checkbox" checked={Boolean(form.is_active)} onChange={e=>update('is_active',e.target.checked)}/>Actif</label>}
          {error && <p role="alert" className="text-red-300">{error}</p>}
          <button className="bg-blue-600 px-5 py-2 rounded disabled:opacity-50">{busy?'Enregistrement…':'Enregistrer'}</button>
        </fieldset>
      </form>}
    </Modal>
    <Modal isOpen={Boolean(archive)} title={tab==='zones'?'Supprimer la zone':'Désactiver cet élément'} onClose={()=>{if(!busy)setArchive(null);}}>
      <p className="text-white">{archive?.name} : {tab==='zones'?'la zone sera supprimée si aucune table ne lui est rattachée.':'cet élément ne sera plus disponible pour de nouvelles opérations. L’historique sera conservé.'}</p>
      {error && <p role="alert" className="text-red-300 mt-3">{error}</p>}
      <button disabled={busy} onClick={confirmArchive} className="mt-4 bg-red-600 text-white rounded px-4 py-2">Confirmer</button>
    </Modal>
    <ReportsPanel isOpen={reports} onClose={()=>setReports(false)}/>
  </div>;
}
