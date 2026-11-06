// End-to-end smoke test in a hidden Electron window. Only tagged fixtures are removed.
const {app}=require('electron');
const {Pool}=require('pg');
const {randomUUID,randomBytes,scryptSync}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs/promises');
require('dotenv').config({quiet:true});
const tag=randomUUID(), username='smoke-'+tag, password='Smoke-Password-2026!';
const ids={user:randomUUID(),category:randomUUID(),product:randomUUID(),zone:randomUUID(),table:randomUUID()};
const name='SMOKE-'+tag;
const directory=path.resolve('.test-electron-'+tag);
require('node:fs').mkdirSync(directory,{recursive:true});
app.setPath('userData',directory);
app.disableHardwareAcceleration();
let pool,window,finished=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=setTimeout(()=>void finish(new Error('Délai du test Electron dépassé')),60000);
async function finish(error){
 if(finished)return;finished=true;clearTimeout(timeout);
 app.removeAllListeners('window-all-closed');
 if(error && window && !window.isDestroyed()){
   const diagnostic=await window.webContents.executeJavaScript("document.body.innerText.slice(0,1800)").catch(()=> 'Indisponible');
   console.error('État interface : '+diagnostic);
   const diagnosticFloor=await window.webContents.executeJavaScript("window.electronAPI.getFloor().then(rows=>({count:rows.length})).catch(e=>({error:e.message}))").catch(()=>null);
   console.error('Diagnostic tables : '+JSON.stringify(diagnosticFloor));
 }
 try{
  if(pool){
   await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_id=$1)',[ids.table]);
   await pool.query('DELETE FROM orders WHERE table_id=$1',[ids.table]);
   await pool.query('DELETE FROM products WHERE id=$1 OR name=$2',[ids.product,name+' extra']);
   await pool.query('DELETE FROM restaurant_tables WHERE id=$1',[ids.table]);
   await pool.query('DELETE FROM categories WHERE id=$1',[ids.category]);await pool.query('DELETE FROM zones WHERE id=$1',[ids.zone]);
   await pool.query('DELETE FROM logs WHERE user_id=$1',[ids.user]);await pool.query('DELETE FROM app_users WHERE id=$1',[ids.user]);
   await pool.end();
  }
  await require('../dist-electron/db.js').closeDB();
 }catch(cleanup){error=error || cleanup;}
 if(window && !window.isDestroyed())window.destroy();
 // Chromium may retain cache handles until process exit. Leave only the unique test profile if locked.
 const relative=path.relative(process.cwd(),directory);
 if(!path.isAbsolute(relative) && /^\.test-electron-[a-f0-9-]{36}$/.test(relative))await fs.rm(directory,{recursive:true,force:true,maxRetries:2}).catch(()=>{});
 if(error)console.error('Test Electron échoué : '+error.message);
 else console.log('OK : fenêtre Electron, preload, connexion, sélection de table, autosauvegarde, encaissement, fermeture du reçu et ajout de produit depuis l’interface.');
 app.exit(error?1:0);
}
async function evaluate(code){try{return await window.webContents.executeJavaScript(code,true);}catch(error){throw new Error(code.slice(0,250)+' : '+error.message);}}
async function until(code){for(let i=0;i<150;i++){if(await evaluate(code))return;await delay(100);}throw new Error('État attendu absent : '+code);}
const setInput=(selector,value)=>`{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`;
const clickText=text=>`{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!button || button.disabled)throw new Error('Bouton indisponible : '+JSON.stringify([...document.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled}))));button.click();}`;
async function run(){
 await until("Boolean(document.querySelector('input[type=password]'))");
 await evaluate(setInput('input[type=text]',username));await evaluate(setInput('input[type=password]',password));
 await evaluate("document.querySelector('form').requestSubmit()");
 await until("document.body.textContent.includes('Cliquez sur une table')");
  await until(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(name+' table')})))`);
 await evaluate(clickText(name+' table'));
 await until("document.body.textContent.includes('Commande enregistrée')");
 await until(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(name+' produit')})))`);
 await evaluate(clickText(name+' produit'));
 let saved=false;
 for(let i=0;i<80;i++){const row=(await pool.query('SELECT * FROM orders WHERE table_id=$1',[ids.table])).rows[0];if(row?.total===100){saved=true;break;}await delay(100);}
 if(!saved)throw new Error('Panier non sauvegardé');
 await until("!document.body.textContent.includes('Enregistrement…')");
 await evaluate(clickText('Clôturer'));
 await until("Boolean(document.querySelector('[role=dialog] input[type=number]'))");
 await evaluate(setInput('[role=dialog] input[type=number]','150'));
 await evaluate(clickText('Procéder au paiement'));
 await until("document.body.textContent.includes('Facture')");
 const paid=(await pool.query('SELECT * FROM orders WHERE table_id=$1',[ids.table])).rows[0];
 if(paid.status!=='closed' || paid.amount_paid!==150 || paid.change_due!==50)throw new Error('Encaissement incorrect');
 await evaluate("document.querySelector('[role=dialog] button[aria-label=Fermer]').click()");
 await until("document.body.textContent.includes('Cliquez sur une table')");
 await evaluate(clickText('Admin'));await until("document.body.textContent.includes('Administration')");
 await until("!document.body.textContent.includes('Actualisation…')");
 await evaluate(clickText('Ajouter'));
 await until("Boolean(document.querySelector('[role=dialog] form'))");
 await evaluate(setInput('[role=dialog] input:not([type])',name+' extra'));
 await evaluate(setInput('[role=dialog] input[type=number]','123'));
 await evaluate(`{const select=document.querySelector('[role=dialog] select');select.value=${JSON.stringify(ids.category)};select.dispatchEvent(new Event('change',{bubbles:true}));}`);
 await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
 await until("document.body.textContent.includes('Modifications enregistrées.')");
 if(!(await pool.query('SELECT id FROM products WHERE name=$1',[name+' extra'])).rowCount)throw new Error('Produit non créé');
}
app.whenReady().then(async()=>{
 const url=new URL(process.env.DATABASE_URL);url.searchParams.delete('schema');pool=new Pool({connectionString:url.toString()});
 const salt=randomBytes(16).toString('hex'),hash='scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex');
 await pool.query('INSERT INTO app_users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[ids.user,name,username,hash,'admin']);
 await pool.query('INSERT INTO categories(id,name,color,icon,sort_order) VALUES($1,$2,$3,$4,-100)',[ids.category,name+' catégorie','#123456','cup']);
 await pool.query('INSERT INTO products(id,name,price,category_id) VALUES($1,$2,100,$3)',[ids.product,name+' produit',ids.category]);
 await pool.query('INSERT INTO zones(id,name,color) VALUES($1,$2,$3)',[ids.zone,name+' zone','#123456']);
 await pool.query('INSERT INTO restaurant_tables(id,name,zone_id) VALUES($1,$2,$3)',[ids.table,name+' table',ids.zone]);
 // Keep this UI test isolated from the daily backup scheduler and its profile directory.
 const backup=require('../dist-electron/backup.js');backup.createBackupManager=()=>({daily:async()=>null,status:()=>({directory:'Test',lastFile:null,lastError:null,running:false})});
 app.on('browser-window-created',(_,created)=>{
  window=created;
  created.webContents.on('console-message',(event)=>{if(event.level==='error')console.error('Renderer : '+event.message);});
  created.webContents.once('did-finish-load',()=>{void run().then(()=>finish()).catch(finish);});
 });
 require('../dist-electron/main.js');
}).catch(finish);
