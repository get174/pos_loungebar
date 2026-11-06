import { useState } from 'react';
import { pairMobile } from '../lib/mobile';

export function PosSetup({onReady}:{onReady:()=>void}){
 const [url,setUrl]=useState('');const [name,setName]=useState('Caisse Android');
 const [key,setKey]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
  <form className="w-full max-w-md bg-slate-800 rounded-2xl p-6 space-y-5" onSubmit={async event=>{
   event.preventDefault();if(busy)return;setBusy(true);setError('');
   try{await pairMobile(url,key,name);setKey('');onReady();}
   catch(error){setError(error instanceof Error?error.message:'Serveur inaccessible. Vérifiez le Wi-Fi et l’adresse.');}
   finally{setBusy(false);}
  }}>
   <h1 className="text-2xl font-bold">Configurer cette caisse</h1>
   <p className="text-slate-300 text-sm">Connectez le POS au réseau du commerce, puis saisissez les informations fournies par l’administrateur.</p>
   <label className="block">Adresse du serveur<input required type="url" autoCapitalize="none" placeholder="https://caisse.exemple.fr" value={url} onChange={e=>setUrl(e.target.value)} className="block w-full mt-2 rounded-lg p-3 bg-slate-700" /></label>
   <label className="block">Nom de cette caisse<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} className="block w-full mt-2 rounded-lg p-3 bg-slate-700" /></label>
   <label className="block">Code d’association<input required type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} className="block w-full mt-2 rounded-lg p-3 bg-slate-700" /></label>
   {error && <p role="alert" className="text-red-300">{error}</p>}
   <button disabled={busy} className="w-full py-3 rounded-lg bg-blue-600 font-semibold disabled:opacity-50">{busy?'Association…':'Associer ce POS'}</button>
  </form>
 </main>;
}
