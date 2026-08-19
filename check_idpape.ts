import { query } from "./src/db";

async function main() {
  console.log("--- Resumen mxtufac por id_pape ---");
  try {
    const res = await query(`
      SELECT 
        id_pape,
        MIN(hora_sal) as hora_min, 
        MAX(hora_sal) as hora_max, 
        COUNT(*) as tickets, 
        SUM(total) as suma_total
      FROM mxtufac
      GROUP BY id_pape
      ORDER BY id_pape DESC
    `);
    console.log(res);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
main();
