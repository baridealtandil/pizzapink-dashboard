import { query } from "./src/db";
async function main() {
  const res = await query(`
    SELECT cod_cpb, prefijo, numero, COUNT(*) as copies, SUM(total) as suma
    FROM mxtufac
    GROUP BY cod_cpb, prefijo, numero
    ORDER BY copies DESC
    LIMIT 10
  `);
  console.log(res);
  process.exit(0);
}
main();
