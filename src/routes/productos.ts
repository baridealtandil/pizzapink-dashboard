import { Hono } from "hono";
import { query } from "../db";
import { cachedRange } from "../cache";
import { parseRango } from "../utils/periods";
import { ITE_UNION, CM2_UNION, COD_ART_SERVICIO_MESA } from "../repo/sql";

// 251 = "Cubiertos", 252 = "Servicio de mesa": cargos de mesa, no productos del menú.
const CODIGOS_NO_PRODUCTO = [251, COD_ART_SERVICIO_MESA];

export const productos = new Hono();

// Ranking de productos: filtrable por rango de fechas, día de la semana y franja horaria.
// Nota: mxite no guarda hora propia, para franja horaria se cruza con mxcm2 (hora del pedido)
// por fecha+numero+cod_art — es una aproximación, no una FK estricta.
productos.get("/ranking", async (c) => {
  const { desde, hasta } = parseRango(c);
  const orden = c.req.query("orden") === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 200);
  const codRua = c.req.query("cod_rua");
  const diaSemana = c.req.query("dia_semana"); // 0=domingo ... 6=sábado (convención JS)
  const franjaInicio = c.req.query("franja_inicio"); // 'HH'
  const franjaFin = c.req.query("franja_fin"); // 'HH'

  const usaFranja = Boolean(franjaInicio && franjaFin);

  const params: unknown[] = [desde, hasta];
  let joinCm2 = "";
  let condicionFranja = "";
  if (usaFranja) {
    joinCm2 = `LEFT JOIN (${CM2_UNION}) cm2 ON cm2.fecha = i.fecha AND cm2.numero = i.numero AND cm2.cod_art = i.cod_art`;
    condicionFranja = "AND LEFT(cm2.hora_ped, 2) BETWEEN ? AND ?";
    params.push(franjaInicio!.padStart(2, "0"), franjaFin!.padStart(2, "0"));
  }

  let condicionDia = "";
  if (diaSemana !== undefined && diaSemana !== "") {
    condicionDia = "AND DAYOFWEEK(i.fecha) = ?";
    params.push(Number(diaSemana) + 1); // DAYOFWEEK: 1=domingo..7=sábado
  }

  let condicionRua = "";
  if (codRua) {
    condicionRua = "AND a.cod_rua = ?";
    params.push(codRua);
  }

  params.push(limit);

  const key = `productos:ranking:${JSON.stringify(params)}:${orden}`;
  const data = await cachedRange(key, hasta, async () => {
    return query(
      `SELECT a.codigo, a.nombre, a.cod_rua,
              SUM(i.cantidad) AS cantidad,
              SUM(i.cantidad * i.precio) AS importe
       FROM (${ITE_UNION}) i
       JOIN mxart a ON a.codigo = i.cod_art
       ${joinCm2}
       WHERE i.fecha BETWEEN ? AND ?
         AND i.cod_art NOT IN (0, ${CODIGOS_NO_PRODUCTO.join(",")})
         ${condicionFranja}
         ${condicionDia}
         ${condicionRua}
       GROUP BY a.codigo, a.nombre, a.cod_rua
       ORDER BY cantidad ${orden}
       LIMIT ?`,
      params
    );
  });

  return c.json({ productos: data });
});

productos.get("/rubros", async (c) => {
  const data = await cachedRange("productos:rubros", "1900-01-01", async () => {
    return query(`SELECT codigo, nombre FROM mxrua ORDER BY nombre`);
  });
  return c.json({ rubros: data });
});
