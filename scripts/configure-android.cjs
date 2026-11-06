const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const java=path.join(root,'android/app/src/main/java/com/posloungebar/cashier');
fs.mkdirSync(java,{recursive:true});
fs.copyFileSync(path.join(root,'native/android/PosDevicePlugin.java'),path.join(java,'PosDevicePlugin.java'));
fs.writeFileSync(path.join(java,'MainActivity.java'),`package com.posloungebar.cashier;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
const manifest=path.join(root,'android/app/src/main/AndroidManifest.xml');
let source=fs.readFileSync(manifest,'utf8');
source=source.replace('android:allowBackup="true"','android:allowBackup="false"');
source=source.replace(/android:icon="[^"]+"/,'android:icon="@drawable/ic_pos"').replace(/android:roundIcon="[^"]+"/,'android:roundIcon="@drawable/ic_pos"');
fs.copyFileSync(path.join(root,'native/android/ic_pos.xml'),path.join(root,'android/app/src/main/res/drawable/ic_pos.xml'));
if(!source.includes('android:usesCleartextTraffic='))source=source.replace('<application','<application android:usesCleartextTraffic="false"');
fs.writeFileSync(manifest,source);
const build=path.join(root,'android/app/build.gradle');
fs.writeFileSync(build,fs.readFileSync(build,'utf8').replace(/namespace\s*=\s*"[^"]+"/,'namespace = "com.posloungebar.cashier"').replace(/applicationId\s+"[^"]+"/,'applicationId "com.posloungebar.cashier"'));
fs.writeFileSync(path.join(root,'android/app/src/main/res/values/strings.xml'),`<?xml version="1.0" encoding="utf-8"?>
<resources>
 <string name="app_name">POS Caisse</string><string name="title_activity_main">POS Caisse</string>
 <string name="package_name">com.posloungebar.cashier</string><string name="custom_url_scheme">com.posloungebar.cashier</string>
</resources>
`);
// HTTP is allowed only in the debug APK for testing on a private LAN.
const debug=path.join(root,'android/app/src/debug');fs.mkdirSync(debug,{recursive:true});
fs.writeFileSync(path.join(debug,'AndroidManifest.xml'),`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
 <application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic" />
</manifest>
`);
console.log('Identité chiffrée, impression Android et configuration native prêtes.');
