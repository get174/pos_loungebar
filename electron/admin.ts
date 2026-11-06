import { randomUUID } from 'crypto';
import { hashPassword, rows, transaction } from './db';

const entities = ['users', 'products', 'categories', 'tables', 'zones'] as const;
type Entity = typeof entities[number];
const tableNames: Record<Entity, string> = {users:'app_users', products:'products', categories:'categories', tables:'restaurant_tables', zones:'zones'};
type Actor = {id: string; username: string};
export async function setDeviceActive(id:string,value:boolean,actor:Actor){
 if(typeof id!=='string' || typeof value!=='boolean')throw new Error('POS invalide');
 return transaction(async c=>{
  const updated=await c.query('UPDATE pos_devices SET is_active=$2 WHERE id=$1',[id,value?1:0]);
  if(!updated.rowCount)throw new Error('POS introuvable');
  if(!value)await c.query('DELETE FROM pos_sessions WHERE device_id=$1',[id]);
  await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.id,actor.username,'POS_ACCESS',JSON.stringify({deviceId:id,active:value})]);
 });
}
function entityName(value: string): Entity {
  if (!entities.includes(value as Entity)) throw new Error('Gestion inconnue');
  return value as Entity;
}
function text(value: unknown, label: string, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} invalide`);
  return value.trim();
}
function integer(value: unknown, label: string, min = 0, max = 2147483647) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${label} invalide`);
  return Number(value);
}
function active(value: unknown) {
  if (![true, false, 0, 1].includes(value as boolean)) throw new Error('État invalide');
  return value ? 1 : 0;
}
function color(value: unknown) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Couleur invalide');
  return value;
}
export async function getAdminData() {
  return transaction(async c => {
    // All lists belong to the same consistent snapshot.
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return {
      users: await rows('SELECT id,name,username,role,is_active,created_at,updated_at FROM app_users ORDER BY username', [], c),
      products: await rows('SELECT * FROM products ORDER BY name', [], c),
      categories: await rows('SELECT * FROM categories ORDER BY sort_order,name', [], c),
      tables: await rows('SELECT * FROM restaurant_tables ORDER BY sort_order,name', [], c),
      zones: await rows('SELECT * FROM zones ORDER BY name', [], c),
      devices: await rows('SELECT id,name,is_active,created_at FROM pos_devices ORDER BY created_at',[],c),
      logs: await rows('SELECT * FROM logs ORDER BY created_at DESC LIMIT 100', [], c),
    };
  });
}
export async function saveEntity(entity: string, input: Record<string, unknown>, actor: Actor) {
  const kind = entityName(entity);
  if (!input || typeof input !== 'object') throw new Error('Données invalides');
  const name = text(input.name, 'Nom');
  const id = input.id === undefined ? randomUUID() : text(input.id, 'Identifiant', 80);
  const creating = input.id === undefined;
  return transaction(async c => {
    if (kind === 'users') await c.query('SELECT pg_advisory_xact_lock(728195)');
    const existing = creating ? null : (await rows(`SELECT * FROM ${tableNames[kind]} WHERE id=$1 FOR UPDATE`, [id], c))[0];
    if (!creating && !existing) throw new Error('Élément introuvable');
    let fields: Record<string, unknown>;
    if (kind === 'users') {
      const username = text(input.username, 'Identifiant utilisateur', 64);
      if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) throw new Error('Identifiant : 3 à 64 lettres, chiffres, points, tirets ou soulignements');
      const role = input.role;
      if (role !== 'admin' && role !== 'cashier') throw new Error('Rôle invalide');
      const isActive = active(input.is_active);
      if (id === actor.id && (role !== 'admin' || !isActive)) throw new Error('Vous ne pouvez pas désactiver ou rétrograder votre propre compte');
      if (existing?.role === 'admin' && existing.is_active && (role !== 'admin' || !isActive)) {
        if (!(await rows("SELECT id FROM app_users WHERE role='admin' AND is_active=1 AND id<>$1", [id], c)).length) throw new Error('Au moins un administrateur actif est requis');
      }
      fields = {name, username, role, is_active:isActive, updated_at:new Date().toISOString()};
      if (creating || input.password) {
        if (typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 1024) throw new Error('Le mot de passe doit contenir au moins 10 caractères');
        fields.password_hash = hashPassword(input.password);
        fields.session_version = (existing?.session_version || 0) + 1;
        fields.must_change_password = id === actor.id ? 0 : 1;
      }
    } else if (kind === 'products') {
      const categoryId = text(input.category_id, 'Catégorie', 80);
      if (!(await rows('SELECT id FROM categories WHERE id=$1 AND is_active=1', [categoryId], c)).length && categoryId !== existing?.category_id) throw new Error('Catégorie inactive ou introuvable');
      fields = {name, price:integer(input.price, 'Prix'), category_id:categoryId, is_active:active(input.is_active), is_favorite:active(input.is_favorite ?? false), sort_order:integer(input.sort_order ?? 0, 'Ordre')};
    } else if (kind === 'categories') {
      fields = {name, color:color(input.color), icon:typeof input.icon === 'string' ? input.icon.slice(0,64) : 'cup', sort_order:integer(input.sort_order ?? 0, 'Ordre'), is_active:active(input.is_active)};
    } else if (kind === 'zones') {
      fields = {name, color:color(input.color)};
    } else {
      const zoneId = text(input.zone_id, 'Zone', 80);
      if (!(await rows('SELECT id FROM zones WHERE id=$1', [zoneId], c)).length) throw new Error('Zone introuvable');
      const hasOrder = (await rows("SELECT id FROM orders WHERE table_id=$1 AND status='open'", [id], c)).length > 0;
      if (!['free','closed'].includes(String(input.status)) && !(hasOrder && input.status === 'occupied')) throw new Error('Statut invalide');
      if (hasOrder && input.status !== 'occupied') throw new Error('La table possède une commande ouverte : clôturez-la ou annulez-la d’abord');
      fields = {name, zone_id:zoneId, capacity:integer(input.capacity, 'Capacité', 1, 1000), sort_order:integer(input.sort_order ?? 0, 'Ordre'), status:hasOrder ? 'occupied' : input.status};
    }
    const columns = Object.keys(fields);
    const values = Object.values(fields);
    if (creating) {
      await c.query(`INSERT INTO ${tableNames[kind]} (id,${columns.join(',')}) VALUES ($1,${columns.map((_,i)=>`$${i+2}`).join(',')})`, [id,...values]);
    } else {
      await c.query(`UPDATE ${tableNames[kind]} SET ${columns.map((col,i)=>`${col}=$${i+2}`).join(',')} WHERE id=$1`, [id,...values]);
    }
    await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)', [randomUUID(),actor.id,actor.username,creating ? 'CREATE_ENTITY':'UPDATE_ENTITY',JSON.stringify({entity:kind,id,name,passwordChanged:Boolean(fields.password_hash)})]);
    return {id};
  });
}
export async function archiveEntity(entity: string, id: string, actor: Actor) {
  const kind = entityName(entity);
  if (kind === 'users') {
    const user = (await rows('SELECT * FROM app_users WHERE id=$1', [id]))[0];
    if (!user) throw new Error('Compte introuvable');
    return saveEntity(kind, {...user, is_active:false}, actor);
  }
  return transaction(async c => {
    const existing = (await rows(`SELECT * FROM ${tableNames[kind]} WHERE id=$1 FOR UPDATE`, [id], c))[0];
    if (!existing) throw new Error('Élément introuvable');
    if (kind === 'products' || kind === 'categories') {
      await c.query(`UPDATE ${tableNames[kind]} SET is_active=0 WHERE id=$1`, [id]);
    } else if (kind === 'tables') {
      if ((await rows("SELECT id FROM orders WHERE table_id=$1 AND status='open'", [id], c)).length) throw new Error('Une commande est ouverte sur cette table');
      // Preserve table identities referenced by historical orders.
      await c.query("UPDATE restaurant_tables SET status='closed' WHERE id=$1", [id]);
    } else {
      if ((await rows('SELECT id FROM restaurant_tables WHERE zone_id=$1', [id], c)).length) throw new Error('Déplacez les tables de cette zone avant de la supprimer');
      await c.query('DELETE FROM zones WHERE id=$1', [id]);
    }
    await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)', [randomUUID(),actor.id,actor.username,'ARCHIVE_ENTITY',JSON.stringify({entity:kind,id,name:existing.name})]);
  });
}
export async function saveSettings(input: Record<string, unknown>, actor: Actor) {
  const values: Record<string,string> = {
    restaurant_name:text(input.restaurant_name, 'Établissement'),
    currency:text(input.currency, 'Devise', 12),
    address:typeof input.address==='string' ? input.address.slice(0,300) : '',
    phone:typeof input.phone==='string' ? input.phone.slice(0,60) : '',
    receipt_footer:typeof input.receipt_footer==='string' ? input.receipt_footer.slice(0,300) : '',
    receipt_width:input.receipt_width==='58' ? '58' : '80',
  };
  return transaction(async c => {
    // A database represents one currency; changing the label must never reinterpret historical amounts.
    const previousCurrency=(await rows("SELECT value FROM settings WHERE key='currency' FOR UPDATE",[],c))[0]?.value;
    if(previousCurrency && previousCurrency!==values.currency && (await rows('SELECT id FROM orders LIMIT 1',[],c)).length) throw new Error('La devise ne peut plus être modifiée après la création d’une commande. Les montants historiques doivent garder leur devise.');
    for (const [key,value] of Object.entries(values)) await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key,value]);
    await c.query('INSERT INTO logs(id,user_id,username,action,details) VALUES($1,$2,$3,$4,$5)', [randomUUID(),actor.id,actor.username,'UPDATE_SETTINGS',JSON.stringify(Object.keys(values))]);
  });
}
