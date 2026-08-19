import { query } from "./src/db";
async function main() {
  const c = await query(`
    SELECT hora, modulo, proceso, detalle 
    FROM mxaud 
    WHERE hora >= '17:50' AND hora <= '18:10'
    ORDER BY hora ASC
  `);
  console.log(c);
  process.exit(0);
}
main();
