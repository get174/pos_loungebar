const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const db=require('../dist-electron/db.js');
const {createApiServer,initApiSchema}=require('../dist-electron/server.js');

async function main(){
 await db.initDB();await initApiSchema();
 const tag=randomUUID(),password='Api-Test-Password-2026!',key=randomUUID();
 const ids={cashier:randomUUID(),other:randomUUID(),admin:randomUUID(),category:randomUUID(),product:randomUUID(),table:randomUUID()};
 const devices=[];let server,base;
 const post=async(route,data,device,token)=>{
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(device?{'X-POS-Device':device.token}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  return {status:response.status,...await response.json()};
 };
 const rpc=(method,args,device,token)=>post('/api/rpc',{method,args},device,token);
 try{
  for(const [kind,id] of Object.entries(ids).filter(([kind])=>['cashier','other','admin'].includes(kind)))await db.rows('INSERT INTO app_users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,'API '+kind,kind+'-'+tag,db.hashPassword(password),kind==='admin'?'admin':'cashier']);
  await db.rows('INSERT INTO categories(id,name,color,icon) VALUES($1,$2,$3,$4)',[ids.category,'API '+tag,'#123456','cup']);
  await db.rows('INSERT INTO products(id,name,price,category_id) VALUES($1,$2,100,$3)',[ids.product,'API produit',ids.category]);
  await db.rows('INSERT INTO restaurant_tables(id,name) VALUES($1,$2)',[ids.table,'API '+tag]);
  server=createApiServer({pairingKey:key});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await post('/api/pair',{key:'incorrect',name:'Refus'})).status,403);
  for(let i=0;i<2;i++){
   const device=await post('/api/pair',{key,name:'API test '+i});assert.equal(device.status,200);assert(device.id && device.token);devices.push(device);
  }
  const [a,b]=devices;
  assert.equal((await post('/api/login',{username:'admin-'+tag,password},a)).status,403);
  assert.equal((await post('/api/login',{username:'cashier-'+tag,password:'incorrect'},a)).status,401);
  const login=await post('/api/login',{username:'cashier-'+tag,password},a);
  const sameUserOtherPos=await post('/api/login',{username:'cashier-'+tag,password},b);
  const other=await post('/api/login',{username:'other-'+tag,password},b);
  assert.equal(login.status,200);assert.equal(login.user.password_hash,undefined);
  assert.equal((await rpc('getSession',[],b,login.token)).status,401);
  assert.equal((await rpc('getAdminData',[],a,login.token)).status,403);
  assert.equal((await rpc('getOrders',['closed'],a,login.token)).status,403);
  const created=await rpc('createOrder',[{table_id:ids.table,cashier_id:ids.admin,pos_id:b.id}],a,login.token);
  assert.equal(created.status,200);let order=created.result;
  assert.equal(order.cashier_id,ids.cashier);assert.equal(order.pos_id,a.id);
  const items=[{product_id:ids.product,quantity:2,unit_price:1}];
  for(const session of [sameUserOtherPos,other]){
   for(const [method,args] of [['createOrder',[{table_id:ids.table}]],['getOrder',[order.id]],['getOrderItems',[order.id]],['saveOrder',[order.id,items,null,order.version]],['saveOrder',[order.id,items,200,order.version]],['cancelOrder',[order.id,order.version,'Interdit']]]){
    const denied=await rpc(method,args,b,session.token);assert.equal(denied.status,403,method);assert.match(denied.error,/ORDER_ACCESS/);
   }
  }
  const floor=await rpc('getFloor',[],b,other.token);
  assert.equal(floor.result.find(t=>t.id===ids.table).can_edit,false);
  assert.equal((await rpc('getFloor',[],a,login.token)).result.find(t=>t.id===ids.table).can_edit,true);
  let saved=await rpc('saveOrder',[order.id,items,null,order.version],a,login.token);
  assert.equal(saved.status,200);assert.equal(saved.result.total,200);order=saved.result;
  assert.equal((await rpc('saveOrder',[order.id,items,null,order.version-1],a,login.token)).status,409);
  assert.equal((await rpc('getReceipt',[order.id],a,login.token)).status,400);
  // Administrator retains cross-POS access through the same database business logic.
  const admin={id:ids.admin,username:'admin-'+tag};
  const override=await db.withTerminal('admin-desktop',()=>db.saveOrder(order.id,[{product_id:ids.product,quantity:3}],undefined,order.version,admin));
  assert.equal(override.cashier_id,ids.cashier);assert.equal(override.pos_id,a.id);
  saved=await rpc('saveOrder',[order.id,[{product_id:ids.product,quantity:3}],350,override.version],a,login.token);
  assert.equal(saved.status,200);assert.equal(saved.result.status,'closed');assert.equal(saved.result.change_due,50);
  assert.equal((await rpc('saveOrder',[order.id,items,350,saved.result.version],a,login.token)).status,400);
  const receipt=await rpc('getReceipt',[order.id],a,login.token);assert.equal(receipt.status,200);assert.match(receipt.result,/API produit/);
  assert.equal((await rpc('getReceipt',[order.id],b,other.token)).status,403);
  // Terminal and session identities survive an API restart.
  await new Promise(resolve=>server.close(resolve));server=createApiServer({pairingKey:key});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  assert.equal((await rpc('getOrder',[order.id],a,login.token)).status,200);
  await rpc('logoutLocal',[],a,login.token);assert.equal((await rpc('getOrder',[order.id],a,login.token)).status,401);
  const changed=await rpc('changePassword',[password,password+'2'],b,sameUserOtherPos.token);
  assert.equal(changed.status,200);assert(changed.result.token);
  assert.equal((await rpc('getSession',[],b,sameUserOtherPos.token)).status,401);
  assert.equal((await rpc('getSession',[],b,changed.result.token)).status,200);
  await db.rows('UPDATE pos_devices SET is_active=0 WHERE id=$1',[b.id]);
  assert.equal((await rpc('getSession',[],b,changed.result.token)).status,401);
  const origin=await fetch(base+'/api/pair',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({key,name:'Refus'})});assert.equal(origin.status,403);
  console.log('OK API : association, rôles, sessions liées au POS, propriétaire non falsifiable, refus sur autre POS/caissier, panier, concurrence, paiement unique, reçu, administration Electron, redémarrage, déconnexion, mot de passe et révocation du terminal.');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await db.rows('DELETE FROM pos_sessions WHERE user_id=ANY($1::text[])',[[ids.cashier,ids.other,ids.admin]]);
  await db.rows('DELETE FROM pos_devices WHERE id=ANY($1::text[])',[devices.map(d=>d.id)]);
  await db.rows('DELETE FROM order_items WHERE order_id IN(SELECT id FROM orders WHERE table_id=$1)',[ids.table]);
  await db.rows('DELETE FROM orders WHERE table_id=$1',[ids.table]);
  await db.rows('DELETE FROM logs WHERE user_id=ANY($1::text[])',[[ids.cashier,ids.other,ids.admin]]);
  await db.rows('DELETE FROM products WHERE id=$1',[ids.product]);await db.rows('DELETE FROM restaurant_tables WHERE id=$1',[ids.table]);await db.rows('DELETE FROM categories WHERE id=$1',[ids.category]);
  await db.rows('DELETE FROM app_users WHERE id=ANY($1::text[])',[[ids.cashier,ids.other,ids.admin]]);
  await db.closeDB();
 }
}
main().catch(async error=>{console.error('Test API échoué : '+(error.code || error.message));await db.closeDB().catch(()=>{});process.exitCode=1;});
