import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';

export const isAndroid=import.meta.env.MODE==='android' || Capacitor.getPlatform()==='android';
interface Connection {url:string;deviceToken:string;deviceId:string;name:string;}
interface NativeStorage {
 getConnection():Promise<{value:string|null}>;
 setConnection(input:{value:string}):Promise<void>;
 printReceipt(input:{html:string}):Promise<{success:boolean;cancelled:boolean}>;
}
const native=registerPlugin<NativeStorage>('PosDevice');
let connection:Connection|null=null;
let sessionToken:string|null=null;
export const hasMobileConnection=()=>!!connection;
export const mobileConnectionName=()=>connection?.name || '';
export function validateServerUrl(value:string){
 const url=new URL(value.trim());
 if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))throw new Error('Indiquez uniquement l’adresse du serveur, par exemple https://caisse.exemple.fr.');
 const local=/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
 if(url.protocol==='http:' && !local)throw new Error('Utilisez HTTPS, ou une adresse IP du réseau local pour un test.');
 return url.origin;
}
async function request(url:string,route:string,data:unknown,deviceToken?:string,token?:string|null){
 const response=await CapacitorHttp.post({url:url+route,headers:{'Content-Type':'application/json',...(deviceToken?{'X-POS-Device':deviceToken}:{}),...(token?{Authorization:'Bearer '+token}:{})},data,connectTimeout:8000,readTimeout:15000});
 const result=typeof response.data==='string'?JSON.parse(response.data):response.data;
 if(response.status<200 || response.status>=300){
  const message=result?.error || 'Connexion au serveur impossible.';
  if(message.includes('[AUTH]')){sessionToken=null;window.dispatchEvent(new Event('pos-session-expired'));}
  if(message.includes('[DEVICE]')){window.dispatchEvent(new Event('pos-device-revoked'));}
  throw new Error(message);
 }
 return result;
}
export async function pairMobile(url:string,key:string,name:string){
 const normalized=validateServerUrl(url);
 const result=await request(normalized,'/api/pair',{key,name});
 const saved={url:normalized,deviceToken:result.token,deviceId:result.id,name};
 await native.setConnection({value:JSON.stringify(saved)});
 connection=saved;sessionToken=null;
}
export async function initializeMobile(){
 if(!isAndroid)return;
 const saved=await native.getConnection();
 if(saved.value){
  const parsed:Connection=JSON.parse(saved.value);
  parsed.url=validateServerUrl(parsed.url);
  if(!parsed.deviceToken || !parsed.deviceId)throw new Error('Association du POS invalide.');
  connection=parsed;
 }
 const rpc=async(method:string,args:unknown[]=[])=>{
  if(!connection)throw new Error('Associez ce POS au serveur.');
  if(method==='getSession' && !sessionToken)return null;
  if(method==='getSettings' && !sessionToken)return {};
  if(method==='logoutLocal'){
   try{if(sessionToken)await request(connection.url,'/api/rpc',{method,args},connection.deviceToken,sessionToken);}
   finally{sessionToken=null;}return;
  }
  const result=await request(connection.url,'/api/rpc',{method,args},connection.deviceToken,sessionToken);
  if(method==='changePassword'){sessionToken=result.result.token;window.dispatchEvent(new Event('pos-settings-refresh'));return result.result.user;}
  return result.result;
 };
 // Preserve the existing application API while replacing IPC with authenticated requests.
 const api={
  loginLocal:async(username:string,password:string)=>{
   if(!connection)throw new Error('Associez ce POS au serveur.');
   const result=await request(connection.url,'/api/login',{username,password},connection.deviceToken);
   sessionToken=result.token;window.dispatchEvent(new Event('pos-settings-refresh'));return result.user;
  },
  printOrder:async(id:string)=>{
   const html=await rpc('getReceipt',[id]);
   return native.printReceipt({html});
  },
 } as unknown as Window['electronAPI'];
 const methods=['getSession','logoutLocal','changePassword','saveOrder','getOrder','cancelOrder','getSettings','getUsers','getCategories','getZones','getProducts','getTables','getFloor','getOrders','getOrderItems','createOrder','getAdminData','saveEntity','archiveEntity','saveSettings','getBackupStatus','backupNow','getAppVersion','isDev','getPosServerInfo','setDeviceActive'] as const;
 for(const method of methods)Object.assign(api,{[method]:(...args:unknown[])=>rpc(method,args)});
 window.electronAPI=api;
}
