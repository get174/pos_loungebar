import { BrowserWindow } from 'electron';
import db from './db';

import { renderReceipt } from './receipt-render';
export { renderReceipt } from './receipt-render';

export async function printReceipt(id: string, parent: BrowserWindow) {
  const [order,settings] = await Promise.all([db.getOrder(id),db.getSettings()]);
  if(order.status!=='closed') throw new Error('Seule une commande encaissée peut être imprimée');
  const window = new BrowserWindow({show:false,parent,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderReceipt(order,settings))}`);
    const height = await window.webContents.executeJavaScript('Math.ceil(document.body.scrollHeight / 96 * 25400)');
    return await new Promise<{success:boolean; cancelled:boolean}>((resolve,reject)=>{
      window.webContents.print({silent:false,printBackground:false,color:false,margins:{marginType:'none'},pageSize:{width:settings.receipt_width==='58'?58000:80000,height:Math.min(2000000,Math.max(60000,Number(height)+5000))}},(success,reason)=>{
        if(success) resolve({success:true,cancelled:false});
        else if(/cancel/i.test(reason)) resolve({success:false,cancelled:true});
        else reject(new Error('Impression impossible. Vérifiez l’imprimante et le format du papier. Le paiement reste enregistré.'));
      });
    });
  } finally { if(!window.isDestroyed())window.destroy(); }
}
