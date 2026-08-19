import type { Context } from "hono";

export class RangoError extends Error {}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarFecha(valor: string, nombre: string) {
  if (!FECHA_RE.test(valor)) {
    throw new RangoError(`El parámetro '${nombre}' debe tener formato YYYY-MM-DD`);
  }
}

export function comparativo(actual: number, anterior: number, invertido: boolean = false) {
  if (anterior === 0) return { pct: 100, up: actual >= 0, diff: actual };
  const diff = actual - anterior;
  const rawPct = (Math.abs(diff) / anterior) * 100;
  // invertido = true => si diff < 0 es "bueno" (verde), si no es false
  const up = invertido ? (diff <= 0) : (diff >= 0); 
  return {
    pct: rawPct,
    up,
    diff: diff
  };
}

export function parseRango(c: Context) {
  const desde = c.req.query("desde");
  const hasta = c.req.query("hasta");
  if (!desde || !hasta) {
    throw new RangoError("Los parámetros 'desde' y 'hasta' son obligatorios (formato YYYY-MM-DD)");
  }
  validarFecha(desde, "desde");
  validarFecha(hasta, "hasta");

  const desde2 = c.req.query("desde2") ?? null;
  const hasta2 = c.req.query("hasta2") ?? null;
  if (desde2) validarFecha(desde2, "desde2");
  if (hasta2) validarFecha(hasta2, "hasta2");

  return { desde, hasta, desde2, hasta2 };
}
