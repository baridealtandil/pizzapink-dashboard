import { query } from "./db";

async function run() {
  const COD_ART_SERVICIO_MESA = 252;
  const fecha = "2026-07-10";

  const rowsComensales = await query(`
    SELECT SUM(comensales) as comensales FROM (
      SELECT i.cantidad as comensales
      FROM mxite i
      JOIN mxfac f ON i.cod_cpb = f.cod_cpb AND i.prefijo = f.prefijo AND i.numero = f.numero AND i.fecha = f.fecha
      WHERE i.fecha = ? AND i.cod_art = ?
      UNION ALL
      SELECT i.cantidad as comensales
      FROM mxtuite i
      JOIN mxtufac f ON i.cod_cpb = f.cod_cpb AND i.prefijo = f.prefijo AND i.numero = f.numero AND i.fecha = f.fecha
      WHERE i.fecha = ? AND i.cod_art = ?
    ) t
  `, [fecha, COD_ART_SERVICIO_MESA, fecha, COD_ART_SERVICIO_MESA]);

  console.log("comensales query result:", rowsComensales);
  process.exit(0);
}

run();
