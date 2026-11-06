// Restore only into an explicitly selected, empty database. Existing POS data is never overwritten.
require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const {postgresTool}=require('../dist-electron/backup.js');
async function main(){
 if(!process.argv[2] || !process.env.RESTORE_DATABASE_URL)throw new Error('Indiquez le fichier .dump et RESTORE_DATABASE_URL vers une base vide distincte.');
 const target=new URL(process.env.RESTORE_DATABASE_URL);target.searchParams.delete('schema');
 const source=new URL(process.env.DATABASE_URL);
 if(target.hostname===source.hostname && (target.port||'5432')===(source.port||'5432') && target.pathname===source.pathname)throw new Error('La restauration dans la base de caisse active est interdite. Choisissez une base vide distincte.');
 await fs.access(process.argv[2]);
 const pool=new Pool({connectionString:target.toString(),connectionTimeoutMillis:5000});
 try{
  const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')");
  if(tables.rowCount)throw new Error('La base cible contient déjà des tables. Aucune donnée ne sera remplacée.');
  await promisify(execFile)(await postgresTool('pg_restore'),['--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-password','--host',target.hostname,'--port',target.port||'5432','--username',decodeURIComponent(target.username),'--dbname',decodeURIComponent(target.pathname.slice(1)),process.argv[2]],{windowsHide:true,timeout:120000,env:{...process.env,PGPASSWORD:decodeURIComponent(target.password),PGCONNECT_TIMEOUT:'5'}});
  console.log('Restauration terminée dans la base cible vide. Vérifiez les données avant de modifier DATABASE_URL.');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error.code ? 'Restauration échouée. Vérifiez PostgreSQL, pg_restore et le fichier de sauvegarde.' : error.message);process.exitCode=1;});
