import { Hono } from "hono";
import { query } from "../db";
import { cachedRange, cached } from "../cache";
import { parseRango } from "../utils/periods";
import { comparativo } from "../utils/comparativo";

export const compras = new Hono();

// mxgas tiene filas viejas con fecha nula (epoch DBF 1899-11-30) — se descartan siempre.
const FECHA_VALIDA = "fecha > '1900-01-01'";

async function proveedoresPeriodo(desde: string, hasta: string) {
  const key = `compras:proveedores:${desde}:${hasta}`;
  return cachedRange(key, hasta, async () => {
    return query<{ codigo: number; nombre: string; total: number; comprobantes: number }>(
      `SELECT p.codigo, p.nombre, SUM(g.total) AS total, COUNT(*) AS comprobantes
       FROM mxgas g
       JOIN mxpro p ON p.codigo = g.cod_pro
       WHERE ${FECHA_VALIDA} AND g.fecha BETWEEN ? AND ?
       GROUP BY p.codigo, p.nombre
       ORDER BY total DESC`,
      [desde, hasta]
    );
  });
}

compras.get("/proveedores", async (c) => {
  const { desde, hasta, desde2, hasta2 } = parseRango(c);
  const actual = await proveedoresPeriodo(desde, hasta);

  if (!desde2 || !hasta2) {
    return c.json({ proveedores: actual });
  }

  const comparado = await proveedoresPeriodo(desde2, hasta2);
  const porCodigo = new Map(comparado.map((p) => [p.codigo, p]));

  const proveedores = actual.map((p) => {
    const comp = porCodigo.get(p.codigo);
    return {
      codigo: p.codigo,
      nombre: p.nombre,
      total: comparativo(p.total, comp?.total ?? 0, true),
    };
  });

  return c.json({ proveedores });
});

// Deuda pendiente por proveedor: es un saldo corriente (no un rango de fechas), se cachea 1h.
compras.get("/deudas", async (c) => {
  const data = await cached("compras:deudas", 60 * 60 * 1000, async () => {
    return query<{ codigo: number; nombre: string; total_comprado: number; total_pagado: number }>(
      `SELECT p.codigo, p.nombre,
              COALESCE(g.total_comprado, 0) AS total_comprado,
              COALESCE(pg.total_pagado, 0) AS total_pagado
       FROM mxpro p
       LEFT JOIN (
         SELECT cod_pro, SUM(total) AS total_comprado
         FROM mxgas WHERE ${FECHA_VALIDA}
         GROUP BY cod_pro
       ) g ON g.cod_pro = p.codigo
       LEFT JOIN (
         SELECT cod_pro, SUM(importe) AS total_pagado
         FROM mxpag
         GROUP BY cod_pro
       ) pg ON pg.cod_pro = p.codigo
       HAVING total_comprado > 0
       ORDER BY (total_comprado - total_pagado) DESC`
    );
  });

  const conDeuda = data.map((p) => ({
    ...p,
    deuda: p.total_comprado - p.total_pagado,
  }));

  return c.json({ proveedores: conDeuda });
});
