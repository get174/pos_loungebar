import http, { IncomingMessage, ServerResponse } from 'http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import path from 'path';
import db, { rows, transaction, withTerminal, SessionUser, CartInput } from './db';
import { createBackupManager } from './backup';
import { renderReceipt } from './receipt-render';

const digest=(secret:string)=>createHash('sha256').update(secret).digest('hex');
class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
const fail=(status:number,message:string):never=>{throw new ApiError(status,message);};
function text(value:unknown,max=200):string {
 if(typeof value!=='string' || !value.trim() || value.length>max) return fail(400,'Données invalides.');
 return value;
}
function number(value:unknown):number {
 if(!Number.isSafeInteger(value))return fail(400,'Nombre invalide.');return value as number;
}
async function body(request:IncomingMessage):Promise<Record<string,unknown>> {
 if(!request.headers['content-type']?.startsWith('application/json'))return fail(415,'JSON requis.');
 let size=0;const chunks:Buffer[]=[];
 for await(const chunk of request){size+=chunk.length;if(size>128*1024)return fail(413,'Requête trop volumineuse.');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value || typeof value!=='object' || Array.isArray(value))throw new Error();return value;}
 catch{return fail(400,'JSON invalide.');}
}
function send(response:ServerResponse,status:number,value:unknown){
 response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 response.end(JSON.stringify(value));
}
export async function initApiSchema(){
 await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(728196)');
  await c.query(`CREATE TABLE IF NOT EXISTS pos_devices (
   id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
   is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
   CREATE TABLE IF NOT EXISTS pos_sessions (
   token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES pos_devices(id),
   user_id TEXT NOT NULL REFERENCES app_users(id), session_version INTEGER NOT NULL,
   expires_at TIMESTAMPTZ NOT NULL);`);
  await c.query('DELETE FROM pos_sessions WHERE expires_at<=now()');
 });
}
export function createApiServer(options:{pairingKey:string;sessionHours?:number}){
 if(options.pairingKey.length<16)throw new Error('POS_PAIRING_KEY doit contenir au moins 16 caractères.');
 const attempts=new Map<string,{count:number;until:number}>();
 const limit=(key:string,max:number)=>{
  const now=Date.now();
  for(const [entry,value] of attempts)if(value.until<=now)attempts.delete(entry);
  const value=attempts.get(key) || {count:0,until:now+60_000};
  value.count++;attempts.set(key,value);if(value.count>max)fail(429,'Trop de tentatives. Réessayez dans une minute.');
 };
 const authenticateDevice=async(request:IncomingMessage)=>{
  const token=text(request.headers['x-pos-device'],200);
  const device=(await rows('SELECT id FROM pos_devices WHERE token_hash=$1 AND is_active=1',[digest(token)]))[0];
  if(!device)fail(401,'[DEVICE] POS non reconnu ou désactivé.');return device.id as string;
 };
 const authenticate=async(request:IncomingMessage,device:string,allowPasswordChange=false)=>{
  const token=request.headers.authorization?.replace(/^Bearer /,'');
  if(!token) return fail(401,'[AUTH] Connexion requise.');
  const session=(await rows('SELECT * FROM pos_sessions WHERE token_hash=$1 AND device_id=$2 AND expires_at>now()',[digest(token),device]))[0];
  const user=session && await db.getUser(session.user_id);
  if(!user || user.session_version!==session.session_version)return fail(401,'[AUTH] Session expirée.');
  if(user.role!=='cashier')return fail(403,'L’administration est réservée à l’application Windows.');
  if(user.must_change_password && !allowPasswordChange)return fail(403,'Modifiez votre mot de passe avant de continuer.');
  return user;
 };
 const newSession=async(device:string,user:SessionUser)=>{
  const token=randomBytes(32).toString('hex');
  await rows('INSERT INTO pos_sessions(token_hash,device_id,user_id,session_version,expires_at) VALUES($1,$2,$3,$4,$5)',[digest(token),device,user.id,user.session_version,new Date(Date.now()+(options.sessionHours || 12)*3600_000)]);
  return token;
 };
 return http.createServer(async(request,response)=>{
  try{
   // Native clients use bearer credentials. No browser cookies or wildcard CORS.
   const origin=request.headers.origin;
   if(origin && !['https://localhost','http://localhost','capacitor://localhost'].includes(origin))fail(403,'Origine refusée.');
   if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');}
   if(request.method==='OPTIONS'){
    response.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-POS-Device');
    response.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');response.writeHead(204);response.end();return;
   }
   const route=new URL(request.url || '/', 'http://localhost').pathname;
   if(request.method==='GET' && route==='/api/health'){send(response,200,{ok:true,service:'pos-lounge-bar',version:1});return;}
   if(request.method!=='POST')return fail(404,'Route inconnue.');
   const input=await body(request);
   if(route==='/api/pair'){
    limit('pair:'+request.socket.remoteAddress,5);
    const key=text(input.key,256);
    if(!timingSafeEqual(Buffer.from(digest(key)),Buffer.from(digest(options.pairingKey))))return fail(403,'Code d’association incorrect.');
    const name=text(input.name,80).trim();const token=randomBytes(32).toString('hex'),id=randomUUID();
    await rows('INSERT INTO pos_devices(id,name,token_hash) VALUES($1,$2,$3)',[id,name,digest(token)]);
    send(response,200,{id,token});return;
   }
   const device=await authenticateDevice(request);
   await withTerminal(device,async()=>{
    if(route==='/api/login'){
     limit('login:'+request.socket.remoteAddress,20);limit('device:'+device,10);
     const user=await db.findUser(text(input.username,64).trim(),text(input.password,1024));
     if(!user)return fail(401,'Identifiants incorrects.');
     if(user.role!=='cashier')return fail(403,'Utilisez l’application Windows pour le compte administrateur.');
     send(response,200,{user,token:await newSession(device,user)});return;
    }
    if(route!=='/api/rpc')return fail(404,'Route inconnue.');
    const method=text(input.method,64);
    const user=await authenticate(request,device,['getSession','logoutLocal','changePassword'].includes(method));
    const args=Array.isArray(input.args)?input.args:[];
    let result:unknown;
    switch(method){
     case 'getSession':result=user;break;
     case 'logoutLocal':await rows('DELETE FROM pos_sessions WHERE token_hash=$1',[digest(request.headers.authorization!.slice(7))]);result=null;break;
     case 'changePassword':{
      await db.changePassword(user.id,text(args[0],1024),text(args[1],1024));
      const fresh=(await db.getUser(user.id))!;
      result={user:fresh,token:await newSession(device,fresh)};break;
     }
     case 'getSettings':result=await db.getSettings();break;
     case 'getCategories':result=await db.getCategories();break;
     case 'getProducts':result=await db.getProducts(args[0]===undefined || args[0]===null?undefined:text(args[0]));break;
     case 'getZones':result=await db.getZones();break;
     case 'getTables':result=await db.getTables();break;
     case 'getFloor':result=(await db.getFloor()).map(table=>({...table,can_edit:!table.current_order || (table.current_order.cashier_id===user.id && table.current_order.pos_id===device)}));break;
     case 'createOrder':{
      const order=args[0] as {table_id?:unknown}|null;
      result=await db.createOrder({table_id:text(order?.table_id),cashier_id:user.id,cashier_name:user.name});break;
     }
     case 'getOrder':result=await db.getOrder(text(args[0]),user);break;
     case 'getOrderItems':result=(await db.getOrder(text(args[0]),user)).items;break;
     case 'getOrders':
      if(args[0]!=='open')return fail(403,'Accès administrateur requis.');
      result=(await db.getOrders('open')).filter(order=>order.cashier_id===user.id && order.pos_id===device);break;
     case 'saveOrder':result=await db.saveOrder(text(args[0]),args[1] as CartInput[],args[2]===undefined || args[2]===null?undefined:number(args[2]),number(args[3]),user);break;
     case 'cancelOrder':result=await db.cancelOrder(text(args[0]),number(args[1]),text(args[2],500),user);break;
     case 'getReceipt':{
      const order=await db.getOrder(text(args[0]),user);
      if(order.status!=='closed')return fail(400,'La commande doit être encaissée.');
      result=renderReceipt(order,await db.getSettings());break;
     }
     default:return fail(403,'Fonction indisponible sur le POS Android.');
    }
    send(response,200,{result:result===undefined?null:result});
   });
  }catch(error){
   const code=(error as {code?:string}).code;
   const message=error instanceof Error?error.message:'';
   const expected=error instanceof ApiError || message.includes('[ORDER_ACCESS]') || message.includes('[CONFLICT]');
   const status=error instanceof ApiError?error.status:message.includes('[ORDER_ACCESS]')?403:message.includes('[CONFLICT]')?409:400;
   send(response,status,{error:expected?message:code?'Opération impossible. Vérifiez les données et la connexion au serveur.':message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[connexion masquée]').slice(0,300) || 'Opération impossible.'});
  }
 });
}
async function main(){
 await db.initDB();await initApiSchema();
 const key=process.env.POS_PAIRING_KEY || '';
 const server=createApiServer({pairingKey:key});
 const port=Number(process.env.POS_API_PORT || 3210),host=process.env.POS_API_HOST || '127.0.0.1';
 const backups=createBackupManager(path.resolve(process.env.POS_DATA_DIR || '.pos-server','backups'));
 await backups.daily();const timer=setInterval(()=>void backups.daily(),3600_000);timer.unref();
 server.requestTimeout=15_000;server.headersTimeout=10_000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 console.log(`Serveur POS prêt sur ${host}:${port}. Electron conserve l’administration de la même base PostgreSQL.`);
 const stop=()=>{clearInterval(timer);server.close(()=>{void db.closeDB();});};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(require.main===module)void main().catch(async()=>{console.error('Démarrage impossible : vérifiez PostgreSQL, POS_PAIRING_KEY et le port du serveur.');await db.closeDB();process.exitCode=1;});
