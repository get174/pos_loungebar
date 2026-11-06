// Run only on an emulator with a fresh install of POS Caisse (never a physical POS).
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const db=require('../dist-electron/db.js');
const {createApiServer}=require('../dist-electron/server.js');
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const serial=process.argv[2];
 if(!/^emulator-\d+$/.test(serial || ''))throw new Error('Indiquez le numéro d’un émulateur Android de test, par exemple emulator-5554.');
 const adb=(...args)=>execute('adb',['-s',serial,...args],{windowsHide:true,timeout:60000});
 const tag=randomUUID(),key=randomUUID(),password='Android-Test-2026!';
 const ids={user:randomUUID(),category:randomUUID(),product:randomUUID(),table:randomUUID()};
 let server,socket,port,deviceId;
 const pending=new Map();let sequence=0;
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Délai CDP dépassé : '+method));},15000);
  pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));
 });
 const evaluate=async expression=>{
  const value=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(value.exceptionDetails)throw new Error(value.exceptionDetails.text+': '+value.exceptionDetails.exception?.description);
  return value.result.value;
 };
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate("Boolean(document.body) && ("+expression+")"))return;await pause(150);}throw new Error('État absent : '+expression+' / '+await evaluate('document.body.innerText.slice(0,1200)'));};
 const fill=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b || b.disabled)throw new Error('Bouton indisponible');b.click();})()`);
 const login=async()=>{
  await until("document.body.textContent.includes('Connexion caissier')");
  await fill('input[type=text]','android-'+tag);await fill('input[type=password]',password);
  await evaluate("document.querySelector('form').requestSubmit()");
  await until("document.body.textContent.includes('Cliquez sur une table')");
 };
 try{
  await db.initDB();
  await db.rows('INSERT INTO app_users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[ids.user,'Android Test','android-'+tag,db.hashPassword(password),'cashier']);
  await db.rows('INSERT INTO categories(id,name,color,icon,sort_order) VALUES($1,$2,$3,$4,-1000)',[ids.category,'Android Test','#123456','cup']);
  await db.rows('INSERT INTO products(id,name,price,category_id) VALUES($1,$2,100,$3)',[ids.product,'Produit Android Test',ids.category]);
  await db.rows('INSERT INTO restaurant_tables(id,name) VALUES($1,$2)',[ids.table,'Android Test '+tag]);
  server=createApiServer({pairingKey:key});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
  await adb('reverse','tcp:'+port,'tcp:'+port);
  await adb('install','-r','-t',path.resolve('release/POS-Caisse-Android-debug.apk'));
  await adb('shell','am','start','-n','com.posloungebar.cashier/.MainActivity');
  let target;
  for(let i=0;i<100;i++){
   try{
    const pid=(await adb('shell','pidof','com.posloungebar.cashier')).stdout.trim();
    if(pid){await adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);const targets=await (await fetch('http://127.0.0.1:9223/json')).json();target=targets.find(t=>t.type==='page');if(target)break;}
   }catch{ /* Wait for the WebView to start. */ }
   await pause(300);
  }
  if(!target)throw new Error('WebView Android non disponible.');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);if(message.error)waiter.reject(new Error(message.error.message));else waiter.resolve(message.result);}});
  await until("document.body.textContent.includes('Configurer cette caisse')");
  await fill('input[type=url]','http://127.0.0.1:'+port);
  await fill('input[maxlength="80"]','Android smoke '+tag);await fill('input[type=password]',key);
  await evaluate("document.querySelector('form').requestSubmit()");await login();
  assert.equal(await evaluate("document.body.textContent.includes('Administration')"),false);
  await click('Android Test '+tag);await until("document.body.textContent.includes('Commande enregistrée')");
  await until("document.body.textContent.includes('Produit Android Test')");await click('Produit Android Test');
  for(let i=0;i<80;i++){
   const row=(await db.rows('SELECT * FROM orders WHERE table_id=$1',[ids.table]))[0];
   if(row?.total===100){deviceId=row.pos_id;break;}await pause(150);
  }
  assert(deviceId,'Autosauvegarde Android absente');
  await until("!document.body.textContent.includes('Enregistrement…')");
  await click('Clôturer');await until("Boolean(document.querySelector('[role=dialog] input[type=number]'))");
  await fill('[role=dialog] input[type=number]','150');await click('Procéder au paiement');await until("document.body.textContent.includes('Facture')");
  const order=(await db.rows('SELECT * FROM orders WHERE table_id=$1',[ids.table]))[0];
  assert.equal(order.status,'closed');assert.equal(order.amount_paid,150);assert.equal(order.change_due,50);
  assert.equal(order.cashier_id,ids.user);assert.equal(order.pos_id,deviceId);
  const storage=(await adb('shell','run-as','com.posloungebar.cashier','cat','shared_prefs/pos-device-connection-v1.xml')).stdout;
  assert.equal(storage.includes('127.0.0.1'),false);assert.equal(storage.includes('Android smoke'),false);
  await adb('shell','screencap','-p','/sdcard/pos-smoke.png');
  await adb('pull','/sdcard/pos-smoke.png',path.resolve('.pos-server/android-smoke.png'));
  await click('Imprimer');await until("document.body.textContent.includes('Dialogue d’impression ouvert')");
  await adb('shell','input','keyevent','4');
  await evaluate("document.querySelector('[role=dialog] button[aria-label=Fermer]').click()");
  await until("document.body.textContent.includes('Cliquez sur une table')");
  // Reload the real WebView: encrypted native configuration must survive, login must not.
  await evaluate('setTimeout(()=>location.reload(),50)');await pause(1000);await login();
  assert.equal((await db.rows('SELECT id FROM pos_devices WHERE name=$1',['Android smoke '+tag])).length,1);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
  console.log('OK Android réel : APK, stockage chiffré Keystore, association native HTTP, connexion caissier, catalogue, autosauvegarde, paiement, dialogue d’impression, identité conservée après rechargement et absence de débordement horizontal.');
 }finally{
  if(socket)socket.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(port)await adb('reverse','--remove','tcp:'+port).catch(()=>{});
  await adb('forward','--remove','tcp:9223').catch(()=>{});
  await adb('shell','am','force-stop','com.posloungebar.cashier').catch(()=>{});
  await db.rows('DELETE FROM pos_sessions WHERE user_id=$1',[ids.user]);
  await db.rows('DELETE FROM pos_devices WHERE name=$1',['Android smoke '+tag]);
  await db.rows('DELETE FROM order_items WHERE order_id IN(SELECT id FROM orders WHERE table_id=$1)',[ids.table]);
  await db.rows('DELETE FROM orders WHERE table_id=$1',[ids.table]);await db.rows('DELETE FROM logs WHERE user_id=$1',[ids.user]);
  await db.rows('DELETE FROM products WHERE id=$1',[ids.product]);await db.rows('DELETE FROM restaurant_tables WHERE id=$1',[ids.table]);
  await db.rows('DELETE FROM categories WHERE id=$1',[ids.category]);await db.rows('DELETE FROM app_users WHERE id=$1',[ids.user]);await db.closeDB();
 }
}
main().catch(async error=>{console.error('Test Android échoué : '+(error.code || error.message));await db.closeDB().catch(()=>{});process.exitCode=1;});
