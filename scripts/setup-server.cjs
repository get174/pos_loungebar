const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {parse}=require('dotenv');
const file=process.env.POS_ENV_FILE || path.resolve(__dirname,'../.env');
let source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const values=parse(source);
if(!values.DATABASE_URL){console.error('Configurez DATABASE_URL dans .env avant de préparer le serveur.');process.exit(1);}
const settings={POS_PAIRING_KEY:values.POS_PAIRING_KEY || randomBytes(24).toString('hex'),POS_API_HOST:values.POS_API_HOST || '0.0.0.0',POS_API_PORT:values.POS_API_PORT || '3210'};
if(settings.POS_PAIRING_KEY.length<16){console.error('POS_PAIRING_KEY doit contenir au moins 16 caractères.');process.exit(1);}
for(const [name,value] of Object.entries(settings)){
 const entry=name+'="'+value+'"';
 const pattern=new RegExp('^'+name+'=.*$','m');
 source=pattern.test(source)?source.replace(pattern,entry):source.trimEnd()+'\n'+entry+'\n';
}
fs.writeFileSync(file,source);
console.log('Configuration serveur prête. Le code d’association est accessible dans Electron : Administration → POS Android, après redémarrage.');
if(settings.POS_API_HOST==='127.0.0.1')console.log('Pour les terminaux du réseau local, définissez POS_API_HOST sur l’adresse IP locale du PC ou 0.0.0.0.');
