const assert=require('node:assert/strict');
const React=require('react');
const {act,create}=require('react-test-renderer');
const {build}=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const copy=value=>JSON.parse(JSON.stringify(value));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const bundle=await build({entryPoints:['src/hooks/useOrderDraft.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
 const compiled=new Module(path.resolve('scripts/.draft-test.cjs'),module);compiled.filename=path.resolve('scripts/.draft-test.cjs');compiled.paths=module.paths;compiled._compile(bundle.outputFiles[0].text,compiled.filename);
 const {useOrderDraft}=compiled.exports;
 const storage=new Map();global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const events=new EventTarget();global.window=events;
 let server={id:'order',version:0,status:'open',items:[],total:0};let writes=0,fail=false,delay=null;
 window.electronAPI={getOrder:async()=>copy(server),saveOrder:async(id,items,paid,version)=>{
   writes++;if(fail)throw new Error('ECONNREFUSED');if(delay)await delay;
   if(version!==server.version)throw new Error('[CONFLICT]');
   server={...server,version:version+1,items:items.map(i=>({...i,unit_price:100,subtotal:i.quantity*100})),total:items.reduce((sum,i)=>sum+i.quantity*100,0)};return copy(server);
 }};
 Object.freeze(window.electronAPI); // Electron contextBridge freezes the exposed object.
 let state,tree;
 function Probe(){state=useOrderDraft('order');return null;}
 const mount=async()=>{await act(async()=>{tree=create(React.createElement(Probe));await pause(0);});};
 const unmount=async()=>{await act(async()=>tree.unmount());};
 const item={product_id:'product',product_name:'Test',unit_price:100,quantity:2,subtotal:200};
 try{
   await mount();assert(state.loaded);assert.equal(writes,0);
   act(()=>state.changeCart(()=>[item]));assert(storage.has('pos-draft:order'));
   await unmount();await mount();assert.equal(state.cart[0].quantity,2);
   await act(async()=>{await pause(700);});assert.equal(server.total,200);assert(!storage.has('pos-draft:order'));

   // Editing while a save is in flight must retain and subsequently save the newer edit.
   let release;delay=new Promise(resolve=>{release=resolve;});
   act(()=>state.changeCart(items=>items.map(i=>({...i,quantity:3,subtotal:300}))));
   let pending;await act(async()=>{pending=state.flush();await pause(0);});
   act(()=>state.changeCart(items=>items.map(i=>({...i,quantity:4,subtotal:400}))));
   await act(async()=>{release();await pending;});delay=null;
   assert.equal(state.cart[0].quantity,4);assert.equal(JSON.parse(storage.get('pos-draft:order')).version,server.version);
   await act(async()=>{await state.flush();});assert.equal(server.total,400);

   // Offline failures preserve recovery data without continuously hammering PostgreSQL.
   fail=true;act(()=>state.changeCart(items=>items.map(i=>({...i,quantity:5,subtotal:500}))));
   await act(async()=>{await assert.rejects(state.flush());});
   const attempts=writes;await act(async()=>{await pause(700);});assert.equal(writes,attempts);assert(storage.has('pos-draft:order'));
   fail=false;await act(async()=>{await state.flush();});assert.equal(server.total,500);

   // A stale terminal cannot overwrite a newer database version.
   act(()=>state.changeCart(items=>items.map(i=>({...i,quantity:6,subtotal:600}))));server.version++;
   await act(async()=>{await assert.rejects(state.flush(),/CONFLICT/);});assert(state.conflict);assert.equal(server.total,500);
   await unmount();await mount();assert(state.conflict);assert.equal(state.cart[0].quantity,6);
   await act(async()=>{await state.reload(true);});assert(!state.conflict);assert.equal(state.cart[0].quantity,5);assert(!storage.has('pos-draft:order'));
   act(()=>state.complete({...server,status:'closed'}));assert(!state.dirty);
   console.log('OK : pas de sauvegarde vide au chargement, récupération après fermeture, autosauvegarde, édition pendant une requête, panne sans boucle de tentatives, conflit entre caisses et rechargement explicite.');
 }finally{await unmount();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
