import { query } from "./src/db";

async function main() {
  const c_manana = await query(`
    SELECT COUNT(*) as ops, SUM(total) as suma 
    FROM mxtufac 
    WHERE hora_sal < '17:00'
  `);
  
  const c_tarde = await query(`
    SELECT COUNT(*) as ops, SUM(total) as suma 
    FROM mxtufac 
    WHERE hora_sal >= '17:00'
  `);
  
  const c_tarde_early = await query(`
    SELECT COUNT(*) as ops, SUM(total) as suma 
    FROM mxtufac 
    WHERE hora_sal >= '17:00' AND hora_sal <= '18:38'
  `);

  console.log("Mañana:", c_manana[0]);
  console.log("Tarde (todo):", c_tarde[0]);
  console.log("Tarde (hasta 18:38):", c_tarde_early[0]);
  process.exit(0);
}
main();
