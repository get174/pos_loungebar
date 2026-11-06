// This project uses Capacitor core and its local PosDevice plugin, with no Cordova plugins.
// Copy generated files individually: directory replacement fails on some Windows volumes.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const config=require('../capacitor.config.json');
const source=path.resolve(root,config.webDir);
const assets=path.join(root,'android/app/src/main/assets');
const destination=path.join(assets,'public');
if(!fs.existsSync(path.join(source,'index.html')))throw new Error('Compilez l’interface Android avant la synchronisation.');
fs.mkdirSync(destination,{recursive:true});
fs.cpSync(source,destination,{recursive:true});
function prune(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const target=path.join(directory,entry.name);
  if(entry.isSymbolicLink())throw new Error('Lien inattendu dans les fichiers Android générés.');
  if(entry.isDirectory())prune(target);
  else if(!fs.existsSync(path.join(source,path.relative(destination,target))))fs.unlinkSync(target);
 }
}
prune(destination);
fs.writeFileSync(path.join(assets,'capacitor.config.json'),JSON.stringify(config,null,2));
fs.writeFileSync(path.join(assets,'capacitor.plugins.json'),'[]');
fs.writeFileSync(path.join(root,'android/app/src/main/res/xml/config.xml'),`<?xml version="1.0" encoding="utf-8"?>
<widget version="1.0.0" xmlns="http://www.w3.org/ns/widgets"><access origin="*" /></widget>
`);
fs.writeFileSync(path.join(root,'android/settings.gradle'),`include ':app'
apply from: 'capacitor.settings.gradle'
`);
fs.writeFileSync(path.join(root,'android/capacitor.settings.gradle'),`include ':capacitor-android'
project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')
`);
const build=path.join(root,'android/app/build.gradle');
fs.writeFileSync(build,fs.readFileSync(build,'utf8').replace(/^.*implementation project\(':capacitor-cordova-android-plugins'\).*\r?\n/gm,''));
fs.writeFileSync(path.join(root,'android/app/capacitor.build.gradle'),`android {
 compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 }
}
`);
require('./configure-android.cjs');
console.log('Interface et configuration Capacitor synchronisées.');
