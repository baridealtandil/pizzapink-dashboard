import { query } from "./src/db";
import { todayArg, nowArg, addDays, minutosDesdeApertura } from "./src/utils/dates";
import { COD_ART_SERVICIO_MESA } from "./src/repo/sql";
import { segmentacionPorTurno } from "./src/repo/segmentacion";

async function totalDia(fecha: string, minutosCorte?: number) {
  const t0 = Date.now();
  let condicionHora = "";
  let params: unknown[] = [];
  if (minutosCorte !== undefined) {
    condicionHora = `AND (HOUR(hora_sal)*60+MINUTE(hora_sal) - 420 + CASE WHEN HOUR(hora_sal) < 7 THEN 1440 ELSE 0 END) <= ?`;
    params = [fecha, minutosCorte, fecha, minutosCorte];
  } else {
    params = [fecha, fecha];
  }
  const rows = await query<{ total: number | null; comprobantes: number; cubiertos: number | null }>(
    `SELECT SUM(t.total) AS total, SUM(t.cnt) AS comprobantes, SUM(t.cubiertos) AS cubiertos
     FROM (
       SELECT SUM(total) as total, COUNT(*) as cnt, SUM(cubiertos) as cubiertos FROM mxfac WHERE fecha = ? ${condicionHora}
       UNION ALL
       SELECT SUM(total) as total, COUNT(*) as cnt, SUM(cubiertos) as cubiertos FROM mxtufac WHERE fecha = ? ${condicionHora}
     ) t`,
    params
  );
  
  let condicionHoraItems = "";
  let paramsItems: unknown[] = [];
  if (minutosCorte !== undefined) {
    condicionHoraItems = `AND (HOUR(f.hora_sal)*60+MINUTE(f.hora_sal) - 420 + CASE WHEN HOUR(f.hora_sal) < 7 THEN 1440 ELSE 0 END) <= ?`;
    paramsItems = [fecha, COD_ART_SERVICIO_MESA, minutosCorte, fecha, COD_ART_SERVICIO_MESA, minutosCorte];
  } else {
    paramsItems = [fecha, COD_ART_SERVICIO_MESA, fecha, COD_ART_SERVICIO_MESA];
  }
  const rowsComensales = await query<{ comensales: number | null }>(
    `SELECT SUM(comensales) as comensales FROM (
      SELECT i.cantidad as comensales
      FROM mxite i
      JOIN mxfac f ON i.cod_cpb = f.cod_cpb AND i.prefijo = f.prefijo AND i.numero = f.numero AND i.fecha = f.fecha
      WHERE i.fecha = ? AND i.cod_art = ? ${condicionHoraItems}
      UNION ALL
      SELECT i.cantidad as comensales
      FROM mxtuite i
      JOIN mxtufac f ON i.cod_cpb = f.cod_cpb AND i.prefijo = f.prefijo AND i.numero = f.numero AND i.fecha = f.fecha
      WHERE i.fecha = ? AND i.cod_art = ? ${condicionHoraItems}
    ) t`,
    paramsItems
  );
  return Date.now() - t0;
}

async function run() {
  const hoy = todayArg();
  const semanaPasada = addDays(hoy, -7);
  const ayer = addDays(hoy, -1);
  const anteayer = addDays(hoy, -2);
  const { time: horaActual, datetime } = nowArg();
  const minutosCorte = minutosDesdeApertura(horaActual);

  const t0 = Date.now();
  const res = await Promise.all([
      totalDia(hoy),
      totalDia(semanaPasada, minutosCorte),
      totalDia(ayer, minutosCorte),
      totalDia(anteayer, minutosCorte),
      segmentacionPorTurno(hoy, hoy),
      query<{ abiertas: number; totales: number; total_open: string; cubiertos_open: number }>(
        `SELECT 
           (SELECT COUNT(*) FROM mxape) as abiertas,
           (SELECT COUNT(*) FROM mxmes) as totales,
           (SELECT SUM(total) FROM mxape) as total_open,
           (SELECT SUM(cubiertos) FROM mxape) as cubiertos_open`
      ),
      query<{ cod_for: string; forma_pago: string; total: string }>(
        `SELECT c.cod_for, f.nombre as forma_pago, SUM(CAST(c.importe AS DECIMAL(16,2))) as total
         FROM (
           SELECT cod_for, importe FROM mxctc WHERE fecha = ?
           UNION ALL
           SELECT cod_for, importe FROM mxtuctc WHERE fecha = ?
         ) c
         LEFT JOIN mxfor f ON f.codigo = c.cod_for
         GROUP BY c.cod_for, f.nombre
         ORDER BY total DESC`,
        [hoy, hoy]
      ),
    ]);
  console.log("Promise.all took:", Date.now() - t0);
  process.exit(0);
}
run();
