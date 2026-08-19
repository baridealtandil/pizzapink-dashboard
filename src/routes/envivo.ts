import { Hono } from "hono";
import { query } from "../db";
import { cachedLive, cachedRange } from "../cache";
import { comparativo } from "../utils/comparativo";
import { nowArg, todayArg, addDays, minutosDesdeApertura, sqlMinutosDesdeApertura } from "../utils/dates";
import { FAC_UNION, ITE_UNION, COD_ART_SERVICIO_MESA } from "../repo/sql";
import { segmentacionPorTurno } from "../repo/segmentacion";

export const envivo = new Hono();

// minutosCorte: si se pasa, filtra por "lo mismo que llevamos hoy de día laboral" —
// comparado en minutos desde la apertura (7 AM), no por hora de reloj cruda (ver utils/dates).
async function totalDia(fecha: string, minutosCorte?: number) {
  let condicionHora = "";
  let params: unknown[] = [];
  if (minutosCorte !== undefined) {
    condicionHora = `AND ${sqlMinutosDesdeApertura("hora_sal")} <= ?`;
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
  const r = rows[0];

  // Fetch comensales (servicio de mesa)
  let condicionHoraItems = "";
  let paramsItems: unknown[] = [];
  if (minutosCorte !== undefined) {
    condicionHoraItems = `AND ${sqlMinutosDesdeApertura("f.hora_sal")} <= ?`;
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

  return {
    total: Number(r.total ?? 0),
    comprobantes: Number(r.comprobantes ?? 0),
    cubiertos: Number(r.cubiertos ?? 0),
    comensales: Number(rowsComensales[0]?.comensales ?? 0),
  };
}

// Pantalla "HOY": facturación en vivo vs mismo día de la semana pasada cortado al mismo momento del día laboral, cacheado 10 min.
envivo.get("/hoy", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  const data = await cachedLive("envivo:hoy", async () => {
    const hoy = todayArg();
    const semanaPasada = addDays(hoy, -7);
    const ayer = addDays(hoy, -1);
    const anteayer = addDays(hoy, -2);
    const { time: horaActual, datetime } = nowArg();
    const minutosCorte = minutosDesdeApertura(horaActual);

    const t0 = Date.now();
    const [hoyTotal, semanaPasadaMismaHora, segmentacion_turno, ocupacionLive, formasPagoHoy] = await Promise.all([
      totalDia(hoy),
      totalDia(semanaPasada, minutosCorte),
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
    console.log(`[PROFILING] /hoy Promise.all took ${Date.now() - t0}ms`);

    const abiertas = Number(ocupacionLive[0]?.abiertas ?? 0);
    const totales = Number(ocupacionLive[0]?.totales ?? 73);
    const pctOcupacion = totales > 0 ? (abiertas / totales) * 100 : 0;
    const totalOpen = Number(ocupacionLive[0]?.total_open ?? 0);
    const cubiertosOpen = Number(ocupacionLive[0]?.cubiertos_open ?? 0);

    const totalFp = formasPagoHoy.reduce((acc, r) => acc + parseFloat(r.total || "0"), 0);
    const formasPagoPct = formasPagoHoy.map(r => {
      const val = parseFloat(r.total || "0");
      return {
        forma_pago: r.forma_pago || r.cod_for || "OTRO",
        total: val,
        pct: totalFp > 0 ? (val / totalFp) * 100 : 0
      };
    });

    return {
      actualizado: datetime,
      hora_corte: horaActual,
      hoy: {
        fecha: hoy,
        total: hoyTotal.total,
        comprobantes: hoyTotal.comprobantes,
        cubiertos: hoyTotal.cubiertos,
        comensales: hoyTotal.comensales,
        ocupacion: {
          abiertas,
          totales,
          pct: pctOcupacion,
          total_open: totalOpen,
          cubiertos_open: cubiertosOpen
        },
        proyeccion: {
          total: hoyTotal.total + totalOpen,
          comprobantes: hoyTotal.comprobantes + abiertas,
          cubiertos: hoyTotal.cubiertos + cubiertosOpen
        }
      },
      semana_pasada: {
        fecha: semanaPasada,
        total: semanaPasadaMismaHora.total,
        comprobantes: semanaPasadaMismaHora.comprobantes,
        cubiertos: semanaPasadaMismaHora.cubiertos,
        comensales: semanaPasadaMismaHora.comensales
      },
      comparativo: comparativo(hoyTotal.total, semanaPasadaMismaHora.total, true),
      segmentacion_turno,
      formas_pago: formasPagoPct
    };
  }, refresh);

  return c.json(data);
});

// Endpoint para el mapa de Salón (Mesas)
envivo.get("/mesas", async (c) => {
  const reqFecha = c.req.query("fecha");
  const hoyStr = todayArg();
  const fecha = reqFecha || hoyStr;
  const isToday = fecha === hoyStr;

  const cacheKey = isToday ? "envivo:mesas" : `envivo:mesas:${fecha}`;
  const fetcher = async () => {
    // 1. Obtener listado maestro de mesas desde mxmes
    const mesasRows = await query<{
      id: number;
      mesa: string;
      cod_ctv: string;
      x: number;
      y: number;
      ancho: number;
      alto: number;
      plano: string;
    }>(
      `SELECT id, mesa, cod_ctv, x, y, ancho, alto, plano 
       FROM mxmes`
    );

    let abiertasMap = new Map();

    if (isToday) {
      // 2. Estado en vivo desde mxape
      const abiertasRows = await query<{
        mesa: string;
        total: string;
        hora: string;
        mozo: number;
      }>(
        `SELECT mesa, total, hora, mozo
         FROM mxape`
      );

      abiertasRows.forEach(a => {
        abiertasMap.set(a.mesa.trim(), {
          total: parseFloat(a.total),
          hora: a.hora,
          mozo: a.mozo
        });
      });
    }

    // 3. Obtener cerradas históricas (o parciales del día) desde FAC_UNION
    const cerradasRows = await query<{ mesa: string; total: number; tickets: number }>(
      `SELECT TRIM(mesa) as mesa, SUM(total) as total, COUNT(*) as tickets
       FROM (${FAC_UNION}) t
       WHERE t.fecha = ? AND TRIM(mesa) != '' AND mesa IS NOT NULL
       GROUP BY TRIM(mesa)
       ORDER BY total DESC`,
       [fecha]
    );

    const cerradasMap = new Map();
    cerradasRows.forEach(c => cerradasMap.set(c.mesa, c));

    // Si no es hoy, el "ocupada" será true para mesas que tengan facturación (heatmap).
    // Y el "total" de las mesas que se renderizan será el total cerrado (heatmap).
    const planoData = mesasRows.map(m => {
      const isMesa = m.cod_ctv === '-';
      const mesaName = m.mesa.trim();
      const abiertaInfo = isToday ? abiertasMap.get(mesaName) : null;
      const cerradaInfo = cerradasMap.get(mesaName);

      return {
        id: m.id,
        mesa: mesaName,
        is_mesa: isMesa,
        x: m.x,
        y: m.y,
        w: m.ancho,
        h: m.alto,
        plano: m.plano,
        ocupada: isToday ? !!abiertaInfo : !!cerradaInfo, // en histórico, está "ocupada" (tiene color) si facturó
        total: isToday ? (abiertaInfo ? abiertaInfo.total : 0) : (cerradaInfo ? cerradaInfo.total : 0),
        tickets: cerradaInfo ? cerradaInfo.tickets : 0,
        hora_ape: abiertaInfo ? abiertaInfo.hora : null,
        mozo: abiertaInfo ? abiertaInfo.mozo : null
      };
    });

    return {
      mesas: planoData,
      cerradas: cerradasRows,
      isHistorico: !isToday
    };
  };

  const data = isToday ? await cachedLive(cacheKey, fetcher) : await cachedRange(cacheKey, addDays(hoyStr, -1), fetcher);
  return c.json(data);
});

// Detalles de tickets de una mesa en una fecha
envivo.get("/mesas/tickets", async (c) => {
  const fecha = c.req.query("fecha") || todayArg();
  const mesa = c.req.query("mesa");
  if (!mesa) return c.json({ error: "Missing mesa" }, 400);

  const key = `envivo:mesas:tickets:${fecha}:${mesa}`;
  const isToday = fecha === todayArg();

  const fetcher = async () => {
    const cerrados = await query<{ id: number; hora_ape: string; hora_cierre: string; total: number; prefijo: string; tipo_comp: string; descuento: number; mozo: string }>(
      `SELECT t.numero as id, t.hora_ent as hora_ape, t.hora_sal as hora_cierre, t.total, t.prefijo, t.cod_cpb as tipo_comp, t.imp_dto as descuento,
              TRIM(e.nombre) as mozo
       FROM (${FAC_UNION}) t
       LEFT JOIN mxemp e ON t.cod_emp = e.codigo
       WHERE t.fecha = ? AND TRIM(t.mesa) = ?
       ORDER BY t.hora_sal ASC`,
      [fecha, mesa]
    );

    if (isToday) {
      const abiertas = await query<{ hora: string; total: number; mozo: string }>(
        `SELECT a.hora, a.total, TRIM(e.nombre) as mozo
         FROM mxape a
         LEFT JOIN mxemp e ON a.mozo = e.codigo
         WHERE TRIM(a.mesa) = ?`,
        [mesa]
      );
      if (abiertas.length > 0) {
        cerrados.push({
          id: -1,
          hora_ape: abiertas[0].hora,
          hora_cierre: "-",
          total: abiertas[0].total,
          prefijo: "",
          tipo_comp: "Abierta",
          descuento: 0,
          mozo: abiertas[0].mozo
        });
      }
    }
    return cerrados;
  };

  const data = isToday ? await cachedLive(key, fetcher) : await cachedRange(key, addDays(todayArg(), -1), fetcher);
  return c.json(data);
});

// Detalle de productos de un ticket
envivo.get("/mesas/tickets/detalle", async (c) => {
  const fecha = c.req.query("fecha");
  const numero = c.req.query("numero");
  const prefijo = c.req.query("prefijo");
  const cod_cpb = c.req.query("cod_cpb");
  const mesa = c.req.query("mesa");

  if (!fecha || !numero || cod_cpb === undefined || prefijo === undefined) {
    return c.json({ error: "Missing parameters" }, 400);
  }

  if (numero === "-1" || cod_cpb === "Abierta") {
    if (!mesa) return c.json({ error: "Missing mesa for open ticket" }, 400);
    const data = await query<{ cantidad: number; producto: string; total: number }>(
      `SELECT cantidad, TRIM(nombre) as producto, (precio * cantidad) as total
       FROM mxadi
       WHERE TRIM(mesa) = ?`,
      [mesa]
    );
    return c.json(data);
  }

  const key = `envivo:mesas:tickets:detalle:${fecha}:${cod_cpb}:${prefijo}:${numero}`;
  const fetcher = async () => {
    return await query<{ producto: string; cantidad: number; precio: number; total: number }>(
      `SELECT a.nombre as producto, SUM(i.cantidad) as cantidad, i.precio, SUM(i.cantidad * i.precio) as total
       FROM (${ITE_UNION}) i
       JOIN mxart a ON a.codigo = i.cod_art
       WHERE i.fecha = ? AND i.numero = ? AND i.prefijo = ? AND i.cod_cpb = ?
       GROUP BY i.cod_art, a.nombre, i.precio
       ORDER BY total DESC`,
      [fecha, numero, prefijo, cod_cpb]
    );
  };

  const isToday = fecha === todayArg();
  const data = isToday ? await fetcher() : await cachedRange(key, addDays(todayArg(), -1), fetcher);
  return c.json(data);
});

// Últimos 3 días (incluyendo hoy) + comparativo con semana pasada
envivo.get("/ultimos-dias", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  const hoyStr = todayArg();
  const desde = addDays(hoyStr, -2); // Hoy, ayer, anteayer
  const desdeSemanaPasada = addDays(desde, -7);

  const cacheKey = `envivo:ultimos-dias-vs:3:${hoyStr}`;
  const cerrados = await cachedRange(cacheKey, addDays(hoyStr, -1), async () => {
    const res = await query<{ fecha: string; total: number; comprobantes: number }>(
      `SELECT t.fecha AS fecha, SUM(t.total) AS total, SUM(t.cnt) AS comprobantes
       FROM (
         SELECT fecha, SUM(total) as total, COUNT(*) as cnt FROM mxfac WHERE fecha BETWEEN ? AND ? GROUP BY fecha
         UNION ALL
         SELECT fecha, SUM(total) as total, COUNT(*) as cnt FROM mxtufac WHERE fecha BETWEEN ? AND ? GROUP BY fecha
       ) t
       GROUP BY t.fecha
       ORDER BY fecha`,
      [desdeSemanaPasada, addDays(hoyStr, -1), desdeSemanaPasada, addDays(hoyStr, -1)]
    );
    return res;
  }, refresh);

  // Procesamos para sacar el vs
  const mapeoFechas = new Map(cerrados.map(r => [r.fecha, r]));
  
  const diasProcesados = [];
  for (let i = -2; i <= -1; i++) {
    const f = addDays(hoyStr, i);
    const curr = mapeoFechas.get(f);
    if (curr) {
      const fSp = addDays(f, -7);
      const sp = mapeoFechas.get(fSp);
      diasProcesados.push({
        fecha: curr.fecha,
        total: curr.total,
        comprobantes: curr.comprobantes,
        total_sp: sp ? sp.total : 0
      });
    }
  }

  const hoyData = await cachedLive(`envivo:hoy-fila:${hoyStr}`, () => totalDia(hoyStr), refresh);
  const hoySpData = await cachedRange(`envivo:hoy-sp:${hoyStr}`, addDays(hoyStr, -1), () => totalDia(addDays(hoyStr, -7), hoyData.hora_corte), refresh);

  return c.json({
    dias: [...diasProcesados, { fecha: hoyStr, total: hoyData.total, comprobantes: hoyData.comprobantes, total_sp: hoySpData.total, en_vivo: true }],
  });
});

