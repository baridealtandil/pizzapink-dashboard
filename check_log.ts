import { query } from "./src/db";
async function main() {
  const c = await query(`
    SELECT * 
    FROM mxlog 
    WHERE fecha = '2026-07-08'
    ORDER BY hora DESC LIMIT 20
  `);
  console.log(c);
  process.exit(0);
}
main();
