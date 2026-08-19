// src/routes/cuentas.ts
import { Hono } from "hono";
import { query } from "../db";
import { cached } from "../cache";

export const cuentas = new Hono();

// =============================
// Obtener saldos de CTA CTE
// =============================
cuentas.get("/saldos", async (c) => {
  const data = await cached("cuentas:saldos", 60 * 1000, async () => {
    // 1. Clientes activos del padrón
    const clients = await query<{
      codigo: number;
      nombre: string;
      apellido: string;
    }>(`SELECT codigo, nombre, apellido FROM mxcli ORDER BY codigo`);

    // 2. Saldo calculado con la lógica exacta de Maxirest
    //    Usa id_ant para distinguir registros legítimos (id_ant≠0) de duplicados/resync (id_ant=0)
    //    - Si id_ant≠0 → registro legítimo con historial de turnos → consumo
    //    - Si id_ant=0 y el grupo tiene registros con id_ant≠0 → duplicado resync → crédito/pago
    //    - Si id_ant=0 y ninguno en el grupo tiene id_ant≠0 → se usa solo el primero (rn=1)
    const balances = await query<{
      cod_cli: number;
      saldo: string;
      consumos: string;
      pagos: string;
    }>(`
      SELECT
        cod_cli,
        SUM(CASE
          WHEN cod_cpb <> 'P' AND (id_ant != 0 OR (has_ant = 0 AND rn = 1)) THEN importe
          ELSE 0
        END) AS consumos,
        SUM(CASE WHEN cod_cpb = 'P' THEN importe ELSE 0 END)
          + SUM(CASE
              WHEN cod_cpb <> 'P' AND NOT (id_ant != 0 OR (has_ant = 0 AND rn = 1)) THEN importe
              ELSE 0
            END) AS pagos,
        SUM(CASE
          WHEN cod_cpb = 'P' THEN -importe
          WHEN id_ant != 0 OR (has_ant = 0 AND rn = 1) THEN importe
          ELSE -importe
        END) AS saldo
      FROM (
        SELECT
          id, cod_cli, cod_cpb, numero, importe, id_ant,
          ROW_NUMBER() OVER (
            PARTITION BY cod_cli, cod_cpb, numero ORDER BY id ASC
          ) AS rn,
          MAX(CASE WHEN id_ant != 0 THEN 1 ELSE 0 END) OVER (
            PARTITION BY cod_cli, cod_cpb, numero
          ) AS has_ant
        FROM mxctc
        WHERE cod_for = '/'
      ) t
      GROUP BY cod_cli
    `);

    // 3. Mapear resultados por cliente
    const balMap = new Map<number, { cons: number; pag: number; sal: number }>();
    balances.forEach((b) => {
      balMap.set(b.cod_cli, {
        cons: parseFloat(b.consumos || "0"),
        pag: parseFloat(b.pagos || "0"),
        sal: parseFloat(b.saldo || "0"),
      });
    });

    // 4. Construir respuesta final
    return clients
      .map((cl) => {
        const b = balMap.get(cl.codigo) || { cons: 0, pag: 0, sal: 0 };
        return {
          codigo: cl.codigo,
          nombre: `${cl.nombre.trim()} ${cl.apellido.trim()}`.trim(),
          compras: b.cons,
          pagos: b.pag,
          saldo: b.sal,
        };
      })
      .filter((c) => c.compras !== 0 || c.pagos !== 0 || c.saldo !== 0);
  });

  return c.json({ saldos: data });
});

// =============================
// Detalle de transacciones de un cliente
// =============================
cuentas.get("/detalle", async (c) => {
  const codigo = Number(c.req.query("codigo"));
  if (isNaN(codigo)) return c.json({ error: "Código de cliente inválido" }, 400);

  const history = await query<{
    fecha: string;
    cod_cpb: string;
    numero: number;
    importe: number;
    tipo_mov: string;
    pago: string;
  }>(`
    SELECT t.fecha, t.cod_cpb, t.numero, CAST(t.importe AS DECIMAL(16,2)) AS importe,
           t.tipo_mov, t.pago
    FROM (
      -- Consumos: clasificar usando id_ant
      SELECT c.fecha, c.cod_cpb, c.numero, c.importe,
             CASE
               WHEN c.id_ant != 0 THEN 'compra'
               WHEN MAX(CASE WHEN c2.id_ant != 0 THEN 1 ELSE 0 END) = 0
                    AND c.id = MIN(c.id) OVER (PARTITION BY c.cod_cli, c.cod_cpb, c.numero)
                    THEN 'compra'
               ELSE 'ajuste'
             END AS tipo_mov,
             '' AS pago
      FROM mxctc c
      LEFT JOIN mxctc c2 ON c2.cod_cli = c.cod_cli AND c2.cod_cpb = c.cod_cpb
                          AND c2.numero = c.numero AND c2.cod_for = '/' AND c2.id_ant != 0
      WHERE c.cod_cli = ? AND c.cod_for = '/' AND c.cod_cpb <> 'P'
      GROUP BY c.id, c.fecha, c.cod_cpb, c.numero, c.importe, c.id_ant, c.cod_cli

      UNION ALL
      -- Pagos reales
      SELECT p.fecha, p.cod_cpb, p.numero, p.importe, 'pago' AS tipo_mov, p.pago
      FROM mxctc p
      WHERE p.cod_cli = ? AND p.cod_cpb = 'P'
    ) t
    ORDER BY t.fecha DESC, t.numero DESC
    LIMIT 200
  `, [codigo, codigo]);

  return c.json({ history });
});
