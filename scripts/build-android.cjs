const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const android=path.join(root,'android');
const sdk=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if(!fs.existsSync(path.join(android,'local.properties')) && sdk){
 fs.writeFileSync(path.join(android,'local.properties'),'sdk.dir='+sdk.replaceAll('\\','/')+'\n');
}
const windows=process.platform==='win32';
const environment={...process.env,DEBUG:'',GRADLE_USER_HOME:process.env.GRADLE_USER_HOME || path.join(process.env.USERPROFILE || require('node:os').homedir(),'.gradle')};
const result=spawnSync(windows?'cmd.exe':path.join(android,'gradlew'),windows?['/d','/c','gradlew.bat','--no-daemon','assembleDebug']:['--no-daemon','assembleDebug'],{cwd:android,stdio:'inherit',windowsHide:true,env:environment});
if(result.error){console.error('Compilation Android impossible : vérifiez Java et le SDK Android.');process.exit(1);}
if(result.status!==0)process.exit(result.status || 1);
const output=path.join(root,'release','POS-Caisse-Android-debug.apk');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.copyFileSync(path.join(android,'app','build','outputs','apk','debug','app-debug.apk'),output);
console.log('APK de test : '+output);
