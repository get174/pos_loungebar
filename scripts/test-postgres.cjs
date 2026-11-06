const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const Module=require('module');
const ipc=new Map();
const original=Module._load;
Module._load=function(name,...args){
 if(name==='electron')return {app:{getPath:()=>path.join(require('node:os').tmpdir(),'pos-integration-tests'),isPackaged:false,disableHardwareAcceleration:()=>{},whenReady:()=>new Promise(()=>{}),on:()=>{}},ipcMain:{handle:(name,fn)=>ipc.set(name,fn)}};
 return original.call(this,name,...args);
};
const db=require('../dist-electron/db.js');
const admin=require('../dist-electron/admin.js');
const {backupDatabase,postgresTool}=require('../dist-electron/backup.js');
const {renderReceipt}=require('../dist-electron/receipt.js');
const {Pool}=require('pg');
const call=(channel,...args)=>ipc.get('db/'+channel)({},...args);
const password='Test-Only-Password-2026!';

async function main(){
 await db.initDB();
 require('../dist-electron/main.js');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.delete('schema');
 const pool=new Pool({connectionString:url.toString()});
 const tag=randomUUID(), actor={id:randomUUID(),username:'test-admin-'+tag};
 const categoryId=randomUUID(),zoneId=randomUUID(),tableId=randomUUID(),productId=randomUUID();
 const backupFile=path.resolve('.test-postgres-'+tag+'.dump');
 let order,cancelled,userId;
 const restoredDatabase='pos_restore_test_'+tag.replaceAll('-','');
 let restoreCreated=false;
 try {
  await pool.query('INSERT INTO app_users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[actor.id,'TEST Admin',actor.username,db.hashPassword(password),'admin']);
  await pool.query('INSERT INTO categories(id,name,color,icon) VALUES($1,$2,$3,$4)',[categoryId,'TEST Category','#123456','cup']);
  await pool.query('INSERT INTO zones(id,name,color) VALUES($1,$2,$3)',[zoneId,'TEST Zone','#123456']);
  await pool.query('INSERT INTO restaurant_tables(id,name,zone_id) VALUES($1,$2,$3)',[tableId,'TEST Table',zoneId]);
  await pool.query('INSERT INTO products(id,name,price,category_id) VALUES($1,$2,100,$3)',[productId,'TEST Product',categoryId]);

  // Authentication and authorization through the real registered IPC handlers.
  await assert.rejects(call('admin-data'),/AUTH/);
  const login=await call('login',actor.username,password);
  assert.equal(login.role,'admin');assert.equal(login.password_hash,undefined);
  const user=await call('save-entity','users',{name:'TEST Cashier',username:'test-cashier-'+tag,password,role:'cashier',is_active:true});userId=user.id;
  await assert.rejects(admin.saveEntity('users',{id:actor.id,name:'TEST Admin',username:actor.username,role:'cashier',is_active:true},actor),/propre compte/);
  await call('logout');await call('login','test-cashier-'+tag,password);
  await assert.rejects(call('get-tables'),/mot de passe/);
  await call('change-password',password,password+'1');
  await assert.rejects(call('admin-data'),/administrateur/);
  await assert.rejects(call('pos-server-info'),/administrateur/);
  await assert.rejects(call('set-device-active','any-device',false),/administrateur/);
  await assert.rejects(call('save-settings',{}),/administrateur/);
  await assert.rejects(call('get-orders','closed'),/administrateur/);
  const sessionVersion=(await db.getUser(userId)).session_version;
  await admin.saveEntity('users',{id:userId,name:'TEST Cashier',username:'test-cashier-'+tag,password:password+'2',role:'cashier',is_active:true},actor);
  assert.notEqual((await db.getUser(userId)).session_version,sessionVersion);
  await assert.rejects(call('get-tables'),/AUTH/);
  await call('login',actor.username,password);
  assert((await call('get-floor')).some(table=>table.id===tableId));

  // Concurrent opens share one order; concurrent edits cannot overwrite each other.
  const opened=await Promise.all([db.createOrder({table_id:tableId,cashier_id:actor.id}),db.createOrder({table_id:tableId,cashier_id:actor.id})]);
  order=opened[0];assert.equal(order.id,opened[1].id);
  const items=[{product_id:productId,quantity:2,unit_price:1,subtotal:2}];
  // A real cashier cannot change another owner's order, even by bypassing the UI.
  const cashier={id:userId,username:'test-cashier-'+tag};
  await assert.rejects(db.createOrder({table_id:tableId,cashier_id:userId}),/ORDER_ACCESS/);
  await assert.rejects(db.getOrder(order.id,cashier),/ORDER_ACCESS/);
  for(const paid of [undefined,250])await assert.rejects(db.saveOrder(order.id,items,paid,order.version,cashier),/ORDER_ACCESS/);
  await assert.rejects(db.cancelOrder(order.id,order.version,'Interdit',cashier),/ORDER_ACCESS/);
  assert.equal((await db.getOrder(order.id)).version,order.version);
  // Same cashier and same POS are allowed; a different POS (or legacy null) is refused.
  await pool.query('UPDATE orders SET cashier_id=$2 WHERE id=$1',[order.id,userId]);
  assert.equal((await db.createOrder({table_id:tableId,cashier_id:userId})).id,order.id);
  const own=await db.saveOrder(order.id,items,undefined,order.version,cashier);
  for(const pos of ['another-pos',null]){
   await pool.query('UPDATE orders SET pos_id=$2 WHERE id=$1',[order.id,pos]);
   await assert.rejects(db.createOrder({table_id:tableId,cashier_id:userId}),/ORDER_ACCESS/);
   for(const paid of [undefined,250])await assert.rejects(db.saveOrder(order.id,items,paid,own.version,cashier),/ORDER_ACCESS/);
   await assert.rejects(db.cancelOrder(order.id,own.version,'Interdit',cashier),/ORDER_ACCESS/);
  }
  // Administrator overrides both restrictions without changing the original ownership.
  const override=await db.saveOrder(order.id,items,undefined,own.version,actor);
  assert.equal(override.cashier_id,userId);assert.equal(override.pos_id,null);
  await pool.query('UPDATE orders SET cashier_id=$2,pos_id=$3 WHERE id=$1',[order.id,actor.id,order.pos_id]);
  order=await db.getOrder(order.id);
  let saved=await db.saveOrder(order.id,items,undefined,order.version,actor);assert.equal(saved.total,200);
  await assert.rejects(db.saveOrder(order.id,items,undefined,order.version,actor),/CONFLICT/);
  await assert.rejects(db.saveOrder(order.id,items,50,saved.version,actor));
  assert.equal((await db.getOrder(order.id)).version,saved.version);
  await assert.rejects(db.saveOrder(order.id,[{product_id:productId,quantity:-1}],undefined,saved.version,actor));
  assert.equal((await db.getOrderItems(order.id))[0].quantity,2);

  // Existing sales retain their price/name when the catalogue changes or is archived.
  await admin.saveEntity('products',{id:productId,name:'TEST Renamed',price:900,category_id:categoryId,is_active:true},actor);
  await admin.archiveEntity('products',productId,actor);
  saved=await db.saveOrder(order.id,items,undefined,saved.version,actor);
  assert.equal(saved.total,200);assert.equal(saved.items[0].product_name,'TEST Product');
  await assert.rejects(admin.archiveEntity('tables',tableId,actor),/ouverte/);
  await assert.rejects(admin.archiveEntity('zones',zoneId,actor),/tables/);
  const paid=await db.saveOrder(order.id,items,250,saved.version,actor);
  assert.equal(paid.change_due,50);assert.equal(paid.amount_paid,250);
  assert.equal((await pool.query('SELECT status FROM restaurant_tables WHERE id=$1',[tableId])).rows[0].status,'free');
  await assert.rejects(db.saveOrder(order.id,items,250,paid.version,actor));
  const daily=await db.getOrders('closed',new Date(Date.now()-60000).toISOString(),new Date(Date.now()+60000).toISOString());
  assert(daily.some(o=>o.id===order.id));
  cancelled=await db.createOrder({table_id:tableId,cashier_id:actor.id});
  await db.cancelOrder(cancelled.id,cancelled.version,'Test annulation',actor);
  assert.equal((await db.getOrder(cancelled.id)).status,'cancelled');
  assert.equal((await pool.query('SELECT status FROM restaurant_tables WHERE id=$1',[tableId])).rows[0].status,'free');

  // Receipt markup cannot execute text from catalogue/settings.
  const markup=renderReceipt({...paid,items:[{product_name:'<script>alert(1)</script>',quantity:1,subtotal:200}]},{restaurant_name:'<img src=x>',receipt_width:'58',currency:'FC'});
  assert(!markup.includes('<script>'));assert(markup.includes('&lt;script&gt;'));assert(markup.includes('width:58mm'));

  await db.closeDB();await db.initDB();
  assert.equal((await db.getOrder(order.id)).total,200);
  await backupDatabase(backupFile);
  const listing=await promisify(execFile)(await postgresTool('pg_restore'),['--list',backupFile],{windowsHide:true});
  assert(listing.stdout.includes('TABLE DATA public orders'));
  assert(!listing.stdout.includes(url.password));
  assert(/^pos_restore_test_[a-f0-9]{32}$/.test(restoredDatabase));
  await pool.query(`CREATE DATABASE "${restoredDatabase}" TEMPLATE template0`);restoreCreated=true;
  const restoreUrl=new URL(url);restoreUrl.pathname='/'+restoredDatabase;
  await promisify(execFile)(process.execPath,['scripts/restore-postgres.cjs',backupFile],{windowsHide:true,env:{...process.env,RESTORE_DATABASE_URL:restoreUrl.toString()}});
  const restored=new Pool({connectionString:restoreUrl.toString()});
  try{
   const row=(await restored.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
   assert.equal(row.total,200);assert.equal(row.status,'closed');
   assert.equal((await restored.query('SELECT quantity FROM order_items WHERE order_id=$1',[order.id])).rows[0].quantity,2);
  }finally{await restored.end();}
  console.log('OK : IPC et rôles, sessions révoquées, administration, concurrence, prix historiques, rollback, paiement unique, annulation, rapports, persistance, reçu sécurisé, sauvegarde et restauration dans une base temporaire.');
 } finally {
  if(restoreCreated && /^pos_restore_test_[a-f0-9]{32}$/.test(restoredDatabase))await pool.query(`DROP DATABASE "${restoredDatabase}"`);
  await pool.query('DELETE FROM logs WHERE user_id=$1',[actor.id]);
  for(const id of [order?.id,cancelled?.id].filter(Boolean)){await pool.query('DELETE FROM order_items WHERE order_id=$1',[id]);await pool.query('DELETE FROM orders WHERE id=$1',[id]);}
  await pool.query('DELETE FROM products WHERE id=$1',[productId]);await pool.query('DELETE FROM restaurant_tables WHERE id=$1',[tableId]);
  await pool.query('DELETE FROM categories WHERE id=$1',[categoryId]);await pool.query('DELETE FROM zones WHERE id=$1',[zoneId]);
  await pool.query('DELETE FROM app_users WHERE id=ANY($1::text[])',[[actor.id,userId].filter(Boolean)]);
  await fs.unlink(backupFile).catch(()=>{});await fs.unlink(backupFile+'.partial').catch(()=>{});
  await pool.end();await db.closeDB();
 }
}
main().catch(async e=>{console.error('Test PostgreSQL échoué : '+(e.code||e.message));await db.closeDB().catch(()=>{});process.exitCode=1;});
