import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
export function ChangePassword() {
  const {currentUser,changePassword,logout}=useAuth();
  const [current,setCurrent]=useState('');const [next,setNext]=useState('');const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <main className="min-h-screen bg-slate-900 text-white grid place-items-center p-6"><form className="max-w-md w-full bg-slate-800 border border-slate-700 p-8 rounded-2xl space-y-5" onSubmit={async event=>{
    event.preventDefault();if(next!==confirm){setError('Les nouveaux mots de passe ne correspondent pas.');return;}
    setBusy(true);setError('');try{await changePassword(current,next);}catch{setError('Modification impossible. Vérifiez le mot de passe actuel, utilisez au moins 10 caractères différents et réessayez.');}finally{setBusy(false);}
  }}>
    <h1 className="text-2xl font-bold">Personnalisez votre mot de passe</h1><p className="text-slate-300">{currentUser?.name}, remplacez le mot de passe initial avant d’utiliser la caisse.</p>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block">Mot de passe actuel<input required type="password" autoComplete="current-password" maxLength={1024} value={current} onChange={e=>setCurrent(e.target.value)} className="block w-full bg-white text-slate-900 p-3 rounded mt-1"/></label>
      <label className="block">Nouveau mot de passe<input required type="password" autoComplete="new-password" minLength={10} maxLength={1024} value={next} onChange={e=>setNext(e.target.value)} className="block w-full bg-white text-slate-900 p-3 rounded mt-1"/></label>
      <label className="block">Confirmation<input required type="password" autoComplete="new-password" minLength={10} maxLength={1024} value={confirm} onChange={e=>setConfirm(e.target.value)} className="block w-full bg-white text-slate-900 p-3 rounded mt-1"/></label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button className="w-full bg-blue-600 p-3 rounded">{busy?'Enregistrement…':'Enregistrer et accéder à la caisse'}</button>
      <button type="button" className="underline" onClick={()=>void logout()}>Se déconnecter</button>
    </fieldset>
  </form></main>;
}
