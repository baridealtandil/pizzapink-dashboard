import { query } from "./src/db";
async function main() {
  const c = await query(`
    SELECT COUNT(*) as ops, SUM(total) as suma 
    FROM mxtufac 
    WHERE hora_sal >= '18:00' AND hora_sal <= '18:38'
  `);
  console.log(c);
  process.exit(0);
}
main();
