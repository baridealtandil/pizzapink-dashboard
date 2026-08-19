import { Hono } from "hono";
import { query } from "../db";
import { cachedRange } from "../cache";
import { parseRango } from "../utils/periods";
import { FAC_UNION, CM2_UNION } from "../repo/sql";

export const ocupacion = new Hono();

// Heatmap de horarios pico: día de semana (1=domingo..7=sábado, convención MySQL) x hora,
// contando comandas distintas (fecha+numero) como proxy de actividad del salón.
ocupacion.get("/heatmap", async (c) => {
  const { desde, hasta } = parseRango(c);
  const key = `ocupacion:heatmap:${desde}:${hasta}`;

  const data = await cachedRange(key, hasta, async () => {
    return query<{ dia_semana: number; hora: number; comandas: number }>(
      `SELECT DAYOFWEEK(m.fecha) AS dia_semana, CAST(LEFT(m.hora_ped, 2) AS UNSIGNED) AS hora,
              COUNT(DISTINCT CONCAT(m.fecha, '-', m.numero)) AS comandas
       FROM (${CM2_UNION}) m
       WHERE m.fecha BETWEEN ? AND ?
       GROUP BY dia_semana, hora
       ORDER BY dia_semana, hora`,
      [desde, hasta]
    );
  });

  return c.json({ heatmap: data });
});

// Ocupación de mesas: mesas distintas usadas por día + duración promedio de ocupación
// (hora_sal - hora_ent de mxfac), para ver rotación y días de mayor/menor movimiento.
ocupacion.get("/mesas", async (c) => {
  const { desde, hasta } = parseRango(c);
  const key = `ocupacion:mesas:${desde}:${hasta}`;

  const data = await cachedRange(key, hasta, async () => {
    return query<{ fecha: string; mesas_usadas: number; comprobantes: number; duracion_prom_min: number | null }>(
      `SELECT t.fecha AS fecha,
              COUNT(DISTINCT t.mesa) AS mesas_usadas,
              COUNT(*) AS comprobantes,
              AVG(
                CASE WHEN t.hora_sal >= t.hora_ent
                     THEN TIME_TO_SEC(TIMEDIFF(CONCAT(t.hora_sal, ':00'), CONCAT(t.hora_ent, ':00'))) / 60
                     ELSE NULL END
              ) AS duracion_prom_min
       FROM (${FAC_UNION}) t
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.fecha
       ORDER BY t.fecha`,
      [desde, hasta]
    );
  });

  return c.json({ dias: data });
});

ocupacion.get("/mesas-fisicas", async (c) => {
  const data = await cachedRange("ocupacion:mesas-fisicas", "1900-01-01", async () => {
    return query(`SELECT mesa, mozo, unificada FROM mxmes ORDER BY mesa`);
  });
  return c.json({ mesas: data });
});
