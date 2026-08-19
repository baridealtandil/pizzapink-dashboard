import { query } from "../db";

const MAX_ROWS = 300;
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|call|set|lock|unlock)\b/i;

export type SqlToolResult = { ok: true; rows: unknown[]; truncated: boolean } | { ok: false; error: string };

// Defensa en profundidad: el usuario de DB ya es SELECT-only a nivel MySQL,
// pero igual validamos acá para dar mensajes de error claros al modelo y cortar antes del roundtrip.
export async function ejecutarSqlSeguro(sql: string): Promise<SqlToolResult> {
  const limpio = sql.trim().replace(/;+\s*$/, "");

  if (!/^select\b/i.test(limpio)) {
    return { ok: false, error: "Solo se permiten consultas SELECT." };
  }
  if (limpio.includes(";")) {
    return { ok: false, error: "No se permite más de una sentencia por consulta." };
  }
  if (FORBIDDEN.test(limpio)) {
    return { ok: false, error: "La consulta contiene una palabra clave no permitida (solo lectura)." };
  }

  const tieneLimit = /\blimit\s+\d+/i.test(limpio);
  const sqlFinal = tieneLimit ? limpio : `${limpio} LIMIT ${MAX_ROWS}`;

  try {
    const rows = await query(sqlFinal);
    const truncated = rows.length >= MAX_ROWS;
    return { ok: true, rows: rows.slice(0, MAX_ROWS), truncated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error ejecutando la consulta." };
  }
}
