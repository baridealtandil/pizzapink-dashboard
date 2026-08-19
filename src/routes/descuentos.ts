import { Hono } from "hono";
import { query } from "../db";
import { cachedRange } from "../cache";
import { parseRango } from "../utils/periods";
import { comparativo } from "../utils/comparativo";
import { FAC_UNION } from "../repo/sql";

export const descuentos = new Hono();

async function resumenPeriodo(desde: string, hasta: string) {
  const key = `descuentos:resumen:${desde}:${hasta}`;
  return cachedRange(key, hasta, async () => {
    const rows = await query<{ total_dto: number | null; total_ventas: number | null }>(
      `SELECT SUM(t.imp_dto) AS total_dto, SUM(t.total) AS total_ventas
       FROM (${FAC_UNION}) t
       WHERE t.fecha BETWEEN ? AND ?`,
      [desde, hasta]
    );
    const r = rows[0];
    const total_dto = Number(r.total_dto ?? 0);
    const total_ventas = Number(r.total_ventas ?? 0);
    return { total_dto, pct_sobre_ventas: total_ventas > 0 ? (total_dto / total_ventas) * 100 : 0 };
  });
}

// Descuentos suben = malo para el negocio (menos margen), aunque el número crezca.
descuentos.get("/resumen", async (c) => {
  const { desde, hasta, desde2, hasta2 } = parseRango(c);
  const actual = await resumenPeriodo(desde, hasta);

  if (!desde2 || !hasta2) return c.json({ actual });

  const comparado = await resumenPeriodo(desde2, hasta2);
  return c.json({
    total_dto: comparativo(actual.total_dto, comparado.total_dto, false),
    pct_sobre_ventas: comparativo(actual.pct_sobre_ventas, comparado.pct_sobre_ventas, false),
  });
});

// Por motivo: catálogo mxdto es pobre (solo 3 tipos configurados) — no hay columna de
// "empleado que autorizó" el descuento en mxfac/mxite, esa info solo vive como texto libre en mxaud.
descuentos.get("/por-motivo", async (c) => {
  const { desde, hasta } = parseRango(c);
  const key = `descuentos:por-motivo:${desde}:${hasta}`;

  const data = await cachedRange(key, hasta, async () => {
    return query(
      `SELECT d.codigo, d.nombre, d.tipo,
              SUM(t.imp_dto) AS importe,
              COUNT(*) AS comprobantes
       FROM (${FAC_UNION}) t
       JOIN mxdto d ON d.codigo = t.cod_dto
       WHERE t.fecha BETWEEN ? AND ? AND t.imp_dto > 0
       GROUP BY d.codigo, d.nombre, d.tipo
       ORDER BY importe DESC`,
      [desde, hasta]
    );
  });

  return c.json({ motivos: data });
});
