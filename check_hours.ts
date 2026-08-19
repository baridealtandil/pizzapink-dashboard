import { query } from "./src/db";
async function main() {
  const c = await query(`
    SELECT LEFT(hora_sal, 2) as hr, COUNT(*) as ops, SUM(total) as suma 
    FROM mxtufac 
    GROUP BY hr ORDER BY hr
  `);
  console.log(c);
  process.exit(0);
}
main();
