import { query } from "./src/db";

async function main() {
  console.log("--- Resumen mxtufac por turno ---");
  try {
    const res = await query(`
      SELECT 
        fecha_ent, 
        turno,
        MIN(hora_sal) as hora_min, 
        MAX(hora_sal) as hora_max, 
        COUNT(*) as tickets, 
        SUM(total) as suma_total
      FROM mxtufac
      GROUP BY fecha_ent, turno
      ORDER BY fecha_ent DESC, hora_max DESC
    `);
    console.log(res);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
main();
