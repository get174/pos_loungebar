import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import { networkInterfaces } from 'os';
import db, { CartInput, SessionUser } from './db';
import { getAdminData, saveEntity, archiveEntity, saveSettings, setDeviceActive } from './admin';
import { createBackupManager, backupDatabase } from './backup';
import { printReceipt } from './receipt';

let mainWindow: BrowserWindow | null = null;
let backups: ReturnType<typeof createBackupManager>;
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--pos-dev');
// The POS uses ordinary HTML controls. Software rendering avoids GPU-driver startup failures on Windows terminals.
if (process.platform === 'win32' && !app.isReady?.()) app.disableHardwareAcceleration();

const createWindow = () => {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--smoke-test') && mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      console.info('POS : fenêtre ouverte.');
    }
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.on('will-prevent-unload', event => {
    const choice=dialog.showMessageBoxSync(mainWindow!,{type:'question',buttons:['Rester','Quitter'],defaultId:0,cancelId:0,title:'Commande non enregistrée',message:'Un brouillon attend son enregistrement en base. Il sera proposé à la prochaine ouverture de la table sur cet appareil.'});
    if(choice===1)event.preventDefault();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
};

const createMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Plein écran',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: 'Recharger',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          },
        },
      ],
    },
  ];

  if (isDev) {
    template.push({
      label: 'Développeur',
      submenu: [
        {
          label: 'DevTools',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.whenReady().then(async () => {
  try {
    await db.initDB({userData:app.getPath('userData'),envFile:app.isPackaged ? path.join(app.getPath('userData'),'.env') : undefined});
    backups = createBackupManager(path.join(app.getPath('userData'), 'backups'));
    void backups.daily();
    const backupTimer = setInterval(() => { void backups.daily(); }, 60 * 60 * 1000);
    backupTimer.unref();
    createWindow();
  } catch {
    dialog.showErrorBox('Connexion PostgreSQL impossible', 'Vérifiez que PostgreSQL est démarré et que DATABASE_URL est correct dans le fichier .env.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});


let session: Awaited<ReturnType<typeof db.getUser>> = null;
let sessionEpoch=0;
async function requireSession(admin = false, allowPasswordChange = false) {
 if(!session) throw new Error('[AUTH] Connexion requise');
 const epoch=sessionEpoch;
 const user = await db.getUser(session.id);
 if(epoch!==sessionEpoch)throw new Error('[AUTH] Session expirée');
 if(!user || user.session_version !== session.session_version) {
  session=null; throw new Error('[AUTH] Session expirée. Reconnectez-vous.');
 }
 session=user;
 if(user.must_change_password && !allowPasswordChange)throw new Error('Modifiez votre mot de passe avant de continuer');
 if(admin && user.role!=='admin') throw new Error('Accès administrateur requis');
 return user;
}
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('is-dev', () => isDev);
ipcMain.handle('db/login', async (_, username: string, password: string) => {
 const epoch=++sessionEpoch;
 const user=await db.findUser(username,password);
 if(epoch!==sessionEpoch)throw new Error('[AUTH] Connexion interrompue');
 session=user;return user;
});
ipcMain.handle('db/session', async () => session ? requireSession(false,true) : null);
ipcMain.handle('db/logout', () => { sessionEpoch++;session=null; });
ipcMain.handle('db/change-password', async (_, currentPassword: string, newPassword: string) => {
 const user=await requireSession(false,true);
 await db.changePassword(user.id,currentPassword,newPassword);
 session=await db.getUser(user.id);return session;
});
ipcMain.handle('db/get-settings', () => db.getSettings());
function handle<Args extends unknown[],Result>(name: string, admin: boolean, handler: (actor: SessionUser,...args: Args)=>Result) {
 ipcMain.handle('db/'+name, async (_, ...args: unknown[]) => {
  const actor=await requireSession(admin);
  try { return await handler(actor,...args as Args); }
  catch(error) {
   const code=(error as {code?:string}).code;
   if(code==='23505')throw new Error('Cet identifiant existe déjà.');
   if(code==='23503')throw new Error('Cet élément est encore utilisé.');
   throw error;
  }
 });
}
handle('get-users',true,()=>db.getUsers());
handle('get-products',false,(_,category?:string)=>db.getProducts(category));
handle('get-categories',false,()=>db.getCategories());
handle('get-zones',false,()=>db.getZones());
handle('get-tables',false,()=>db.getTables());
handle('get-floor',false,()=>db.getFloor());
handle('get-orders',false,(actor,status?:string,from?:string,to?:string)=>{
 if(status!=='open' && actor.role!=='admin')throw new Error('Accès administrateur requis');
 return db.getOrders(status,from,to);
});
handle('get-order-items',false,(_,id:string)=>db.getOrderItems(id));
handle('get-order',false,(actor,id:string)=>db.getOrder(id,actor));
handle('print-order',false,(_,id:string)=>printReceipt(id,mainWindow!));
handle('create-order',false,(actor,order:{table_id?:unknown})=>db.createOrder({table_id:order?.table_id,cashier_id:actor.id,cashier_name:actor.name}));
handle('save-order',false,(actor,id:string,items:CartInput[],paid:number|undefined,version:number)=>db.saveOrder(id,items,paid,version,actor));
handle('cancel-order',false,(actor,id:string,version:number,reason:string)=>db.cancelOrder(id,version,reason,actor));
handle('admin-data',true,()=>getAdminData());
handle('set-device-active',true,(actor,id:string,active:boolean)=>setDeviceActive(id,active,actor));
handle('pos-server-info',true,()=>{
 const port=process.env.POS_API_PORT || '3210';
 const urls=Object.values(networkInterfaces()).flat().filter(address=>address?.family==='IPv4' && !address.internal).map(address=>`http://${address!.address}:${port}`);
 return {urls,pairingKey:process.env.POS_PAIRING_KEY || '',host:process.env.POS_API_HOST || '127.0.0.1'};
});
handle('save-entity',true,async(actor,entity:string,input:Record<string,unknown>)=>{
 const result=await saveEntity(entity,input,actor);
 if(entity==='users' && result.id===actor.id)session=await db.getUser(actor.id);
 return result;
});
handle('archive-entity',true,(actor,entity:string,id:string)=>archiveEntity(entity,id,actor));
handle('save-settings',true,(actor,input:Record<string,unknown>)=>saveSettings(input,actor));
handle('backup-status',true,()=>backups.status());
handle('backup-now',true,async()=>{
 const result=await dialog.showSaveDialog({title:'Sauvegarder PostgreSQL',defaultPath:`pos-${new Date().toISOString().slice(0,10)}.dump`,filters:[{name:'Sauvegarde PostgreSQL',extensions:['dump']}]});
 if(result.canceled || !result.filePath)return null;
 return backupDatabase(result.filePath);
});
