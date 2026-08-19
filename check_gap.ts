import { query } from "./src/db";
async function main() {
  const c = await query(`
    SELECT hora_sal, total 
    FROM mxtufac 
    WHERE hora_sal >= '17:00' AND hora_sal <= '18:30'
    ORDER BY hora_sal ASC
  `);
  console.log(c);
  process.exit(0);
}
main();
