import { Hono } from "hono";
import { query } from "../db";
import { cachedRange } from "../cache";
import { comparativo } from "../utils/comparativo";
import { parseRango } from "../utils/periods";
import { todayArg, daysInMonth, sqlMinutosDesdeApertura, nowArg, minutosDesdeApertura } from "../utils/dates";
import { FAC_UNION } from "../repo/sql";
import { segmentacionPeriodo, segmentacionPorTurno } from "../repo/segmentacion";

export const ventas = new Hono();

async function totalPeriodo(desde: string, hasta: string, minutosCorte?: number) {
  const key = `ventas:total:${desde}:${hasta}${minutosCorte !== undefined ? ':' + minutosCorte : ''}`;
  return cachedRange(key, hasta, async () => {
    let condicionHora = "";
    let params: unknown[] = [desde, hasta];
    
    if (minutosCorte !== undefined) {
      condicionHora = `AND (fecha != ? OR ${sqlMinutosDesdeApertura("hora_sal")} <= ?)`;
      params.push(hasta, minutosCorte);
    }

    const rows = await query<{ total: number | null; comprobantes: number }>(
      `SELECT SUM(total) AS total, COUNT(*) AS comprobantes
       FROM (${FAC_UNION}) t
       WHERE t.fecha BETWEEN ? AND ? ${condicionHora}`,
      params
    );
    const r = rows[0];
    const total = Number(r.total ?? 0);
    const comprobantes = Number(r.comprobantes ?? 0);
    return { total, comprobantes, promedio: comprobantes > 0 ? total / comprobantes : 0 };
  }, false, minutosCorte !== undefined);
}

ventas.get("/resumen", async (c) => {
  const { desde, hasta, desde2, hasta2 } = parseRango(c);
  
  const hoyStr = todayArg();
  const includesHoy = hasta === hoyStr;
  const { time: horaActual } = nowArg();
  const minutosCorte = includesHoy ? minutosDesdeApertura(horaActual) : undefined;

  let condHora = "";
  let params1: unknown[] = [desde, hasta];
  let params2: unknown[] = [desde, hasta];
  
  if (minutosCorte !== undefined) {
    condHora = `AND (fecha != ? OR ${sqlMinutosDesdeApertura("hora_sal")} <= ?)`;
    params1.push(hasta, minutosCorte);
    params2.push(hasta, minutosCorte);
  }

  const [actual, ocupacionRow, formasPago] = await Promise.all([
    totalPeriodo(desde, hasta),
    query<{ total_mesas: number; promedio_mesas: string }>(
      `SELECT 
         (SELECT COUNT(*) FROM mxmes) as total_mesas,
         (
           SELECT AVG(mesas_usadas) 
           FROM (
             SELECT t.fecha, COUNT(DISTINCT t.mesa) as mesas_usadas
             FROM (${FAC_UNION}) t
             WHERE t.fecha BETWEEN ? AND ?
             GROUP BY t.fecha
           ) d
         ) as promedio_mesas`,
      [desde, hasta]
    ),
    query<{ cod_for: string; forma_pago: string; total: string }>(
      `SELECT c.cod_for, f.nombre as forma_pago, SUM(CAST(c.importe AS DECIMAL(16,2))) as total
       FROM (
         SELECT fecha, cod_for, importe FROM mxctc
         UNION ALL
         SELECT fecha, cod_for, importe FROM mxtuctc
       ) c
       LEFT JOIN mxfor f ON f.codigo = c.cod_for
       WHERE c.fecha BETWEEN ? AND ?
       GROUP BY c.cod_for, f.nombre
       ORDER BY total DESC`,
      [desde, hasta]
    ),
  ]);

  const totalMesas = Number(ocupacionRow[0]?.total_mesas ?? 73);
  const promedioMesas = Number(ocupacionRow[0]?.promedio_mesas ?? 0);
  const pctOcupacion = totalMesas > 0 ? (promedioMesas / totalMesas) * 100 : 0;

  const totalFp = formasPago.reduce((acc, r) => acc + parseFloat(r.total || "0"), 0);
  const formasPagoPct = formasPago.map(r => {
    const val = parseFloat(r.total || "0");
    return {
      forma_pago: r.forma_pago || r.cod_for || "OTRO",
      total: val,
      pct: totalFp > 0 ? (val / totalFp) * 100 : 0
    };
  });

  const baseResponse = {
    periodo: { desde, hasta },
    actual,
    ocupacion: {
      total_mesas: totalMesas,
      promedio_mesas: promedioMesas,
      pct: pctOcupacion
    },
    formas_pago: formasPagoPct
  };

  if (!desde2 || !hasta2) {
    return c.json(baseResponse);
  }

  const comparado = await totalPeriodo(desde2, hasta2, minutosCorte);
  return c.json({
    ...baseResponse,
    periodo_comparado: { desde: desde2, hasta: hasta2 },
    total: comparativo(actual.total, comparado.total, true),
    comprobantes: comparativo(actual.comprobantes, comparado.comprobantes, true),
    promedio: comparativo(actual.promedio, comparado.promedio, true),
  });
});

// Desglose Personas / Tickets para HOY y VENTAS.
ventas.get("/segmentacion", async (c) => {
  const { desde, hasta, desde2, hasta2 } = parseRango(c);
  const key = `ventas:segmentacion:${desde}:${hasta}`;
  const actual = await cachedRange(key, hasta, () => segmentacionPeriodo(desde, hasta));

  const hoyStr = todayArg();
  const includesHoy = hasta === hoyStr;
  const { time: horaActual } = nowArg();
  const minutosCorte = includesHoy ? minutosDesdeApertura(horaActual) : undefined;

  if (!desde2 || !hasta2) {
    return c.json({ periodo: { desde, hasta }, actual });
  }

  const keyComp = `ventas:segmentacion:${desde2}:${hasta2}${minutosCorte !== undefined ? ':' + minutosCorte : ''}`;
  const comparado = await cachedRange(keyComp, hasta2, () => segmentacionPeriodo(desde2, hasta2, minutosCorte), false, minutosCorte !== undefined);

  return c.json({
    periodo: { desde, hasta },
    periodo_comparado: { desde: desde2, hasta: hasta2 },
    personas: comparativo(actual.personas, comparado.personas, true),
    actual,
    comparado,
  });
});

// Reporte Turno Mañana / Turno Tarde-Noche para cualquier ventana temporal.
ventas.get("/segmentacion-turno", async (c) => {
  const { desde, hasta } = parseRango(c);
  const key = `ventas:segmentacion-turno:${desde}:${hasta}`;
  const data = await cachedRange(key, hasta, () => segmentacionPorTurno(desde, hasta));
  return c.json({ periodo: { desde, hasta }, ...data });
});

ventas.get("/serie", async (c) => {
  const { desde, hasta } = parseRango(c);
  const key = `ventas:serie:${desde}:${hasta}`;

  const data = await cachedRange(key, hasta, async () => {
    return query<{ fecha: string; total: number; comprobantes: number }>(
      `SELECT t.fecha AS fecha, SUM(t.total) AS total, COUNT(*) AS comprobantes
       FROM (${FAC_UNION}) t
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.fecha
       ORDER BY fecha`,
      [desde, hasta]
    );
  });

  return c.json({ serie: data });
});

// Proyección mensual: acumulado del mes / días transcurridos * días totales del mes.
// Misma lógica que usa el bot de estadísticas de Telegram.
ventas.get("/proyeccion", async (c) => {
  const mes = c.req.query("mes"); // 'YYYY-MM'
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return c.json({ error: "El parámetro 'mes' es obligatorio (formato YYYY-MM)" }, 400);
  }

  const inicioMes = `${mes}-01`;
  const totalDias = daysInMonth(inicioMes);
  const hoyStr = todayArg();
  const esMesActual = hoyStr.slice(0, 7) === mes;
  
  let hasta = "";
  let diasTranscurridos = 0;
  
  if (esMesActual) {
    const ayerDate = new Date(new Date(hoyStr + "T00:00:00-03:00").getTime() - 86400000);
    const ayer = `${ayerDate.getFullYear()}-${String(ayerDate.getMonth() + 1).padStart(2, '0')}-${String(ayerDate.getDate()).padStart(2, '0')}`;
    if (ayer.slice(0, 7) === mes) {
      hasta = ayer;
      diasTranscurridos = Number(hasta.slice(8, 10));
    } else {
      // It's the 1st of the month, so no days are closed yet for this month.
      hasta = inicioMes;
      diasTranscurridos = 0;
    }
  } else {
    hasta = `${mes}-${String(totalDias).padStart(2, "0")}`;
    diasTranscurridos = Number(hasta.slice(8, 10));
  }

  const { total: acumulado } = diasTranscurridos > 0 ? await totalPeriodo(inicioMes, hasta) : { total: 0 };
  const proyeccion = diasTranscurridos > 0 ? (acumulado / diasTranscurridos) * totalDias : 0;

  return c.json({
    mes,
    acumulado,
    dias_transcurridos: diasTranscurridos,
    dias_totales_mes: totalDias,
    proyeccion,
    es_mes_actual: esMesActual,
  });
});

