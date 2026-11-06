// Explicit, additive demo data: existing entries and prices are never overwritten.
require('dotenv').config({path:process.env.POS_ENV_FILE || '.env',quiet:true});
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const catalog=[
 ['Boissons','#22c55e',[['Coca-Cola',2500],['Fanta',2500],['Sprite',2500],['Eau minérale',1500],['Jus de mangue',3500],['Jus d’ananas',3500]]],
 ['Bières','#f59e0b',[['Primus',4000],['Skol',4000],['Heineken',6000],['Beaufort',5000],['Tembo',4000]]],
 ['Cocktails','#a855f7',[['Mojito',10000],['Virgin Mojito',7000],['Piña Colada',12000],['Cocktail maison',10000],['Spritz',12000]]],
 ['Boissons chaudes','#92400e',[['Espresso',3000],['Café au lait',4000],['Cappuccino',5000],['Thé citron',3000],['Chocolat chaud',5000]]],
 ['Entrées','#14b8a6',[['Salade composée',7000],['Samoussas',5000],['Ailes de poulet',9000],['Assiette de crudités',6000],['Soupe du jour',5000]]],
 ['Plats','#ef4444',[['Poulet braisé',18000],['Poisson grillé',22000],['Brochettes de bœuf',15000],['Burger maison',14000],['Pizza margherita',16000],['Pâtes bolognaises',13000]]],
 ['Accompagnements','#eab308',[['Frites',4000],['Riz',3500],['Bananes plantain',5000],['Chikwangue',3000],['Légumes sautés',5000]]],
 ['Desserts','#ec4899',[['Salade de fruits',6000],['Glace vanille',5000],['Fondant au chocolat',7000],['Crêpe au sucre',5000],['Crêpe chocolat',6500]]]
];
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL manquant.');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.delete('schema');
 const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000,options:'-c search_path=public'});
 const counts={categories:0,products:0,zones:0,tables:0};
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(728194)');
  for(const [sort,[name,color,products]] of catalog.entries()){
   let category=(await client.query('SELECT id FROM categories WHERE lower(name)=lower($1) ORDER BY created_at,id LIMIT 1',[name])).rows[0];
   if(!category){category={id:randomUUID()};await client.query('INSERT INTO categories(id,name,color,icon,sort_order) VALUES($1,$2,$3,$4,$5)',[category.id,name,color,'cup',sort]);counts.categories++;}
   for(const [order,[product,price]] of products.entries()){
    const result=await client.query('INSERT INTO products(id,name,price,category_id,sort_order) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM products WHERE category_id=$4 AND lower(name)=lower($2))',[randomUUID(),product,price,category.id,order]);
    counts.products+=result.rowCount;
   }
  }
  for(const [zoneName,color,prefix,count,capacity,offset] of [['Salle','#0ea5e9','Table',10,4,0],['Terrasse','#22c55e','Terrasse',6,4,10],['Salon VIP','#a855f7','VIP',4,6,16]]){
   let zone=(await client.query('SELECT id FROM zones WHERE lower(name)=lower($1) ORDER BY created_at,id LIMIT 1',[zoneName])).rows[0];
   if(!zone){zone={id:randomUUID()};await client.query('INSERT INTO zones(id,name,color) VALUES($1,$2,$3)',[zone.id,zoneName,color]);counts.zones++;}
   for(let i=1;i<=count;i++){
    const result=await client.query('INSERT INTO restaurant_tables(id,name,zone_id,capacity,sort_order) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM restaurant_tables WHERE lower(name)=lower($2))',[randomUUID(),`${prefix} ${i}`,zone.id,capacity,offset+i]);
    counts.tables+=result.rowCount;
   }
  }
  await client.query('COMMIT');
  console.log(`Ajouts : ${counts.categories} catégories, ${counts.products} produits, ${counts.zones} zones, ${counts.tables} tables. Données existantes conservées.`);
 }catch(error){if(client)await client.query('ROLLBACK');throw error;}
 finally{if(client)client.release();await pool.end();}
}
main().catch(error=>{console.error('Ajout des données de test impossible : '+(error.code || 'vérifiez la configuration et initialisez la base en démarrant l’application.'));process.exitCode=1;});
