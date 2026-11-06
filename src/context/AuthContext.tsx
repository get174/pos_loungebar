import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AppUser } from '../types';
import { isAndroid } from '../lib/mobile';
interface AuthContextType {currentUser: AppUser | null; login: (username: string,password: string) => Promise<{error?: string}>;changePassword:(current:string,next:string)=>Promise<void>;logout:()=>Promise<void>;isLoading:boolean;}
const AuthContext=createContext<AuthContextType | null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
 const [currentUser,setCurrentUser]=useState<AppUser|null>(null);const [isLoading,setIsLoading]=useState(true);
 useEffect(()=>{localStorage.removeItem('pos_user');window.electronAPI?.getSession().then(setCurrentUser).catch(()=>setCurrentUser(null)).finally(()=>setIsLoading(false));if(!window.electronAPI)setIsLoading(false);},[]);
 useEffect(()=>{const expire=()=>setCurrentUser(null);window.addEventListener('pos-session-expired',expire);return()=>window.removeEventListener('pos-session-expired',expire);},[]);
 const login=async(username:string,password:string)=>{try {if(!window.electronAPI) return {error:"Ouvrez l'application Windows avec npm run start:electron."}; const user=await window.electronAPI.loginLocal(username.trim(),password);if(!user)return {error:'Identifiants incorrects.'};setCurrentUser(user);return {};}catch(error){return {error:isAndroid ? (error instanceof Error?error.message:'Serveur inaccessible. Vérifiez le réseau.') : 'Connexion locale impossible. Vérifiez PostgreSQL.'};}};
 const logout=async()=>{await window.electronAPI.logoutLocal();setCurrentUser(null);};
 const changePassword=async(current:string,next:string)=>{setCurrentUser(await window.electronAPI.changePassword(current,next));};
 return <AuthContext.Provider value={{currentUser,login,changePassword,logout,isLoading}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider manquant');return value;}
