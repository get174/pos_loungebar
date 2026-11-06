import { Pool, PoolClient } from 'pg';
import { config } from 'dotenv';
import path from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
let pool: Pool;
let terminalId: string;
const terminalContext=new AsyncLocalStorage<string>();
export function withTerminal<T>(id: string, action: ()=>T): T {return terminalContext.run(id,action);}
const currentTerminal=()=>terminalContext.getStore() || terminalId;
function loadTerminalId(directory: string) {
 mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'pos-terminal-id');
 try { writeFileSync(file,randomUUID(),{flag:'wx'}); }
 catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error; }
 const id=readFileSync(file,'utf8').trim();
 if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Identifiant du POS invalide');
 return id;
}
async function requireOrderAccess(order: {cashier_id: string|null;pos_id: string|null}, actor: {id: string}|undefined, c: PoolClient) {
 const user=actor && (await rows('SELECT role FROM app_users WHERE id=$1 AND is_active=1',[actor.id],c))[0];
 if(!user || (user.role!=='admin' && (order.cashier_id!==actor?.id || !order.pos_id || order.pos_id!==currentTerminal())))
  throw new Error('[ORDER_ACCESS] Cette commande est réservée à son caissier et à son POS d’origine. Un administrateur peut intervenir.');
}
const hash = (password: string) => { const salt = randomBytes(16).toString('hex'); return 'scrypt:' + salt + ':' + scryptSync(password,salt,64).toString('hex'); };
export async function rows(sql: string, params: unknown[] = [], client: Pool | PoolClient = pool) { return (await client.query(sql,params)).rows; }
export interface CartInput {product_id: string; quantity: number;}
export interface SessionUser {id: string;name: string;username: string;role: 'admin'|'cashier';is_active: number;session_version: number;must_change_password: number;}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) { const c = await pool.connect(); try { await c.query('BEGIN'); const value = await fn(c); await c.query('COMMIT'); return value; } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
export const hashPassword = hash;
export async function initDB(options: {userData?:string;envFile?:string} = {}) {
 config({path:process.env.POS_ENV_FILE || options.envFile || path.resolve(__dirname,'../.env'),quiet:true});
 terminalId=loadTerminalId(options.userData || process.env.POS_DATA_DIR || path.resolve('.pos-server'));
 if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant');
 const url = new URL(process.env.DATABASE_URL); url.searchParams.delete('schema');
 pool = new Pool({connectionString:url.toString(), connectionTimeoutMillis:5000, options:'-c search_path=public'});
 pool.on('error', () => { /* A subsequent request will reconnect; do not expose connection credentials. */ });
 await transaction(async c => {
 await c.query('SELECT pg_advisory_xact_lock(728194)');
 await c.query(`
    

    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      category_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone_id TEXT,
      capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'free',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_id TEXT,
      table_name TEXT,
      cashier_id TEXT,
      cashier_name TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      total INTEGER NOT NULL DEFAULT 0,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      change_due INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      opened_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      closed_at TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal INTEGER NOT NULL,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
 await c.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0');
 await c.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_id TEXT');
 await c.query(`CREATE TABLE IF NOT EXISTS pos_devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS pos_sessions (
  token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES pos_devices(id),
  user_id TEXT NOT NULL REFERENCES app_users(id), session_version INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL);`);
 await c.query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0');
 await c.query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0');
 await c.query("CREATE UNIQUE INDEX IF NOT EXISTS one_open_order_per_table ON orders(table_id) WHERE status='open'");
 await c.query('CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)');
 if (!(await rows('SELECT id FROM app_users LIMIT 1',[],c)).length) await c.query('INSERT INTO app_users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'Administrateur','admin',hash(process.env.POS_ADMIN_PASSWORD || 'admin123'),'admin']);
 const initialAdmin=(await rows("SELECT id,password_hash FROM app_users WHERE username='admin'",[],c))[0];
 if(initialAdmin && verifyPassword('admin123',initialAdmin.password_hash)) await c.query('UPDATE app_users SET must_change_password=1 WHERE id=$1',[initialAdmin.id]);
 for (const [key,value] of Object.entries({restaurant_name:'Le Lounge Bar',currency:'FC',receipt_footer:'Merci de votre visite !',address:'',phone:''})) await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,value]);
 if (!(await rows('SELECT id FROM categories LIMIT 1',[],c)).length) {
 const cat = randomUUID(), zone = randomUUID();
 await c.query('INSERT INTO categories(id,name,color,icon) VALUES($1,$2,$3,$4)',[cat,'Boissons','#22c55e','cup']);
 await c.query('INSERT INTO products(id,name,price,category_id) VALUES($1,$2,$3,$4)',[randomUUID(),'Coca-Cola',2500,cat]);
 await c.query('INSERT INTO zones(id,name,color) VALUES($1,$2,$3)',[zone,'Salle','#0ea5e9']);
 for(let i=1;i<=5;i++) await c.query('INSERT INTO restaurant_tables(id,name,zone_id,sort_order) VALUES($1,$2,$3,$4)',[randomUUID(),'Table '+i,zone,i]);
 }
 });
}
export async function findUser(username: string,password: string): Promise<SessionUser | null> {
 if(typeof username !== 'string' || typeof password !== 'string' || password.length > 1024) return null;
 const user = (await rows('SELECT * FROM app_users WHERE username=$1 AND is_active=1',[username]))[0];
 if(!user) return null;
 if(!verifyPassword(password,user.password_hash))return null;
 delete user.password_hash; return user as SessionUser;
}
function verifyPassword(password: string, stored: string) {
 const [format,salt,digest]=stored.split(':');
 if(format!=='scrypt' || !salt || !digest)return false;
 const a=Buffer.from(digest,'hex'),b=scryptSync(password,salt,64);
 return a.length===b.length && timingSafeEqual(a,b);
}
export async function changePassword(id: string,currentPassword: string,newPassword: string) {
 if(typeof currentPassword!=='string' || currentPassword.length>1024 || typeof newPassword!=='string' || newPassword.length<10 || newPassword.length>1024 || newPassword===currentPassword)throw new Error('Choisissez un nouveau mot de passe différent, de 10 caractères minimum');
 return transaction(async c=>{
  const user=(await rows('SELECT * FROM app_users WHERE id=$1 AND is_active=1 FOR UPDATE',[id],c))[0];
  if(!user || !verifyPassword(currentPassword,user.password_hash))throw new Error('Mot de passe actuel incorrect');
  await c.query('UPDATE app_users SET password_hash=$2,must_change_password=0,session_version=session_version+1,updated_at=$3 WHERE id=$1',[id,hash(newPassword),new Date().toISOString()]);
  await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,user.username,'CHANGE_PASSWORD','Mot de passe personnel modifié']);
 });
}
export const getUsers = () => rows('SELECT id,name,username,role,is_active,created_at,updated_at FROM app_users ORDER BY username');
export async function getUser(id: string): Promise<SessionUser | null> {
 return (await rows('SELECT id,name,username,role,is_active,session_version,must_change_password,created_at,updated_at FROM app_users WHERE id=$1 AND is_active=1',[id]))[0] as SessionUser || null;
}
export async function getSettings() {return Object.fromEntries((await rows('SELECT key,value FROM settings')).map(r=>[r.key,r.value]));}
export const getZones = () => rows('SELECT * FROM zones ORDER BY name');
export const getCategories = () => rows('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order');
export const getProducts = (id?: string) => id ? rows('SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.is_active=1 AND c.is_active=1 AND p.category_id=$1 ORDER BY p.sort_order,p.name',[id]) : rows('SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.is_active=1 AND c.is_active=1 ORDER BY p.sort_order,p.name');
export const getTables = () => rows('SELECT * FROM restaurant_tables ORDER BY sort_order');
export const getFloor = () => rows("SELECT t.*, CASE WHEN o.id IS NOT NULL THEN 'occupied' ELSE t.status END AS status, row_to_json(o) AS current_order, row_to_json(z) AS zone FROM restaurant_tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status='open' LEFT JOIN zones z ON z.id=t.zone_id ORDER BY t.sort_order,t.name");
export async function getOrders(status?: string, from?: string, to?: string) {
 const params: string[] = [], conditions: string[] = [];
 for(const [col,op,value] of [['status','=',status],['closed_at::timestamptz','>=',from],['closed_at::timestamptz','<',to]]) if(value) {params.push(value); conditions.push(col+' '+op+' $'+params.length);}
 return rows('SELECT * FROM orders '+(conditions.length?'WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC',params);
}
export const getOrderItems = (id: string) => rows('SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at,id',[id]);
export async function getOrder(id: string, actor?: {id: string}) {
 return transaction(async c => {
  const order = (await rows('SELECT * FROM orders WHERE id=$1 FOR SHARE',[id],c))[0];
  if(!order) throw new Error('Commande introuvable');
  if(actor)await requireOrderAccess(order,actor,c);
  return {...order, items: await rows('SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at,id',[id],c)};
 });
}
export async function createOrder(order: {table_id?: unknown;cashier_id?: unknown;cashier_name?: unknown}) {return transaction(async c=> {
 if(typeof order?.table_id!=='string')throw new Error('Table invalide');
 const table = (await rows('SELECT * FROM restaurant_tables WHERE id=$1 FOR UPDATE',[order.table_id],c))[0];
 if(!table || table.status==='closed') throw new Error('Table indisponible');
 const existing = (await rows("SELECT * FROM orders WHERE table_id=$1 AND status='open'",[order.table_id],c))[0];
 const owner={id:typeof order.cashier_id==='string'?order.cashier_id:''};
 await requireOrderAccess(existing || {cashier_id:owner.id,pos_id:currentTerminal()},owner,c);
 if(existing) return existing;
 const result = (await rows('INSERT INTO orders(id,table_id,table_name,cashier_id,cashier_name,pos_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),table.id,table.name,order.cashier_id,order.cashier_name,currentTerminal()],c))[0];
 await c.query("UPDATE restaurant_tables SET status='occupied' WHERE id=$1",[table.id]);return result;
});}
export async function saveOrder(id: string,items: CartInput[],paid: number | undefined,expectedVersion: number,actor?: {id: string; username: string}) {return transaction(async c=>{
 if(!Array.isArray(items) || items.length>500 || items.some(item=>!item || typeof item.product_id!=='string' || !Number.isSafeInteger(item.quantity) || item.quantity<=0)) throw new Error('Panier invalide');
 const order = (await rows('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id],c))[0];
 if(!order || order.status!=='open') throw new Error('Commande absente ou clôturée');
 await requireOrderAccess(order,actor,c);
 if(!Number.isInteger(expectedVersion) || order.version!==expectedVersion) throw new Error('[CONFLICT] Cette commande a été modifiée sur une autre caisse. Rechargez-la avant de continuer.');
 const previousItems = await rows('SELECT * FROM order_items WHERE order_id=$1',[id],c);
 const products = await rows('SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=ANY($1::text[]) AND p.is_active=1 AND c.is_active=1',[items.map(i=>i.product_id)],c);
 await c.query('DELETE FROM order_items WHERE order_id=$1',[id]);
 let total=0; const seen=new Set();
 for(const item of items) {
 const previous=previousItems.find(p=>p.product_id===item.product_id);
 const p=previous ? {id:previous.product_id,name:previous.product_name,price:previous.unit_price} : products.find(p=>p.id===item.product_id);
 if(!p || !Number.isSafeInteger(p.price) || p.price<0 || !Number.isSafeInteger(item.quantity) || item.quantity<=0 || seen.has(p.id)) throw new Error('Article ou quantité invalide');
 seen.add(p.id); const subtotal=p.price*item.quantity;total+=subtotal;
 if(!Number.isSafeInteger(total) || total>2147483647) throw new Error('Montant trop élevé');
 await c.query('INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,subtotal) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,p.id,p.name,p.price,item.quantity,subtotal]);
 }
 const closing=paid!==undefined;
 if(closing && (!items.length || !Number.isSafeInteger(paid) || paid!<total || paid!>2147483647)) throw new Error('Montant payé invalide');
 const result=(await rows('UPDATE orders SET total=$2,amount_paid=$3,change_due=$4,status=$5,closed_at=$6,updated_at=$7,version=version+1 WHERE id=$1 RETURNING *',[id,total,closing?paid:0,closing?paid!-total:0,closing?'closed':'open',closing?new Date().toISOString():null,new Date().toISOString()],c))[0];
 if(closing) {
 await c.query("UPDATE restaurant_tables SET status='free' WHERE id=$1",[order.table_id]);
 await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor?.id || order.cashier_id,actor?.username || order.cashier_name,'PAYMENT',JSON.stringify({orderId:id,total,paid})]);
 }
 return {...result,items:await rows('SELECT * FROM order_items WHERE order_id=$1',[id],c)};
});}
export async function cancelOrder(id: string, version: number, reason: string, actor: {id: string; username: string}) {
 if(typeof reason!=='string' || !reason.trim() || reason.length>500) throw new Error('Un motif d’annulation est requis');
 return transaction(async c => {
  const order=(await rows('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id],c))[0];
  if(!order || order.status!=='open' || order.version!==version) throw new Error('[CONFLICT] Commande modifiée ou clôturée. Rechargez-la.');
  await requireOrderAccess(order,actor,c);
  await c.query("UPDATE orders SET status='cancelled',notes=$2,closed_at=$3,version=version+1 WHERE id=$1",[id,reason.trim(),new Date().toISOString()]);
  await c.query("UPDATE restaurant_tables SET status='free' WHERE id=$1",[order.table_id]);
  await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.id,actor.username,'CANCEL_ORDER',JSON.stringify({orderId:id,reason:reason.trim()})]);
 });
}
export async function insertLog(log: {user_id?:string;username?:string;action:string;details?:string}) {await pool.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),log.user_id||null,log.username||null,log.action,log.details||'']);}
export async function closeDB() {await pool?.end();}
export default {initDB,findUser,getUser,changePassword,getUsers,getSettings,getZones,getCategories,getProducts,getTables,getFloor,getOrders,getOrderItems,getOrder,createOrder,saveOrder,cancelOrder,insertLog,closeDB};
