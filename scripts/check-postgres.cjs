const { Pool } = require('pg');
require('dotenv').config({quiet:true});
async function main() {
 const url=new URL(process.env.DATABASE_URL);url.searchParams.delete('schema');
 const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
 try {
 const result=await pool.query('SELECT current_database() AS database, version() AS version');
 console.log('Connexion PostgreSQL OK : '+result.rows[0].database);
 const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
 console.log('Tables publiques : '+tables.rows.map(r=>r.tablename).join(', '));
 } finally {await pool.end();}
}
main().catch(e=>{console.error('Échec PostgreSQL : '+(e.code || e.message.replace(/postgresql:\/\/\S+/g,'[connexion masquée]')));process.exitCode=1;});
