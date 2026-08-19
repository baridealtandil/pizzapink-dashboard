import { Hono } from "hono";
import { query } from "../db";
import { cachedRange } from "../cache";
import { parseRango } from "../utils/periods";
import { comparativo } from "../utils/comparativo";
import { FAC_UNION } from "../repo/sql";

export const personal = new Hono();

type Fila = { codigo: number; nombre: string; nombreusu: string; ventas: number; comprobantes: number };

async function rankingPeriodo(desde: string, hasta: string): Promise<Fila[]> {
  const key = `personal:ranking:${desde}:${hasta}`;
  return cachedRange(key, hasta, async () => {
    return query<Fila>(
      `SELECT e.codigo, e.nombre, e.nombreusu,
              SUM(t.total) AS ventas,
              COUNT(*) AS comprobantes
       FROM (${FAC_UNION}) t
       JOIN mxemp e ON e.codigo = t.cod_emp
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY e.codigo, e.nombre, e.nombreusu
       ORDER BY ventas DESC`,
      [desde, hasta]
    );
  });
}

personal.get("/ranking", async (c) => {
  const { desde, hasta, desde2, hasta2 } = parseRango(c);
  const actual = await rankingPeriodo(desde, hasta);

  const nombreDe = (f: Fila) => (f.nombre?.trim() ? f.nombre : f.nombreusu);

  if (!desde2 || !hasta2) {
    return c.json({
      personal: actual.map((f) => ({ codigo: f.codigo, nombre: nombreDe(f), ventas: f.ventas, comprobantes: f.comprobantes })),
    });
  }

  const comparado = await rankingPeriodo(desde2, hasta2);
  const porCodigo = new Map(comparado.map((f) => [f.codigo, f]));

  const personal_ = actual.map((f) => {
    const comp = porCodigo.get(f.codigo);
    return {
      codigo: f.codigo,
      nombre: nombreDe(f),
      ventas: comparativo(f.ventas, comp?.ventas ?? 0, true),
      comprobantes: comparativo(f.comprobantes, comp?.comprobantes ?? 0, true),
    };
  });

  return c.json({ personal: personal_ });
});
