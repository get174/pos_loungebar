const {spawn}=require('node:child_process');
const executable=require('electron');
const environment={...process.env};
// Coding terminals can set this globally, which otherwise launches Electron as plain Node.js.
delete environment.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,process.argv.slice(2),{stdio:'inherit',env:environment,windowsHide:process.argv.includes('--smoke-test')});
child.on('error',()=>{console.error('Impossible de lancer Electron. Vérifiez l’installation des dépendances.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code ?? 1;});
