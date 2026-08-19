import { query } from "../db";
import { FAC_UNION, ITE_UNION, COD_USU_TM, COD_USU_TT } from "./sql";
import { sqlMinutosDesdeApertura } from "../utils/dates";

export type Segmentacion = {
  personas: number;
  tickets: number;
  facturacion_total: number;
  promedio: number;
};

// codUsu opcional: filtra por turno de caja (6=TM/mañana, 7=TT/tarde-noche).
export async function segmentacionPeriodo(
  desde: string,
  hasta: string,
  minutosCorte?: number,
  codUsu?: number
): Promise<Segmentacion> {
  const condHora = minutosCorte !== undefined ? `AND (f.fecha != ? OR ${sqlMinutosDesdeApertura("f.hora_sal")} <= ?)` : "";
  const condUsu = codUsu !== undefined ? "AND f.cod_usu = ?" : "";
  const paramsExtra = [
    ...(minutosCorte !== undefined ? [hasta, minutosCorte] : []),
    ...(codUsu !== undefined ? [codUsu] : []),
  ];

  const paramsTotales = [
    desde, hasta, ...paramsExtra,
    desde, hasta, ...paramsExtra
  ];
  const [totales] = await query<{ personas: number | null; tickets: number; facturacion_total: number | null }>(
    `SELECT SUM(personas) as personas, SUM(tickets) as tickets, SUM(facturacion_total) as facturacion_total FROM (
       SELECT SUM(cubiertos) AS personas, COUNT(*) AS tickets, SUM(total) AS facturacion_total FROM mxfac f WHERE f.fecha BETWEEN ? AND ? ${condHora} ${condUsu}
       UNION ALL
       SELECT SUM(cubiertos) AS personas, COUNT(*) AS tickets, SUM(total) AS facturacion_total FROM mxtufac f WHERE f.fecha BETWEEN ? AND ? ${condHora} ${condUsu}
     ) t`,
    paramsTotales
  );

  const personas = Number(totales.personas ?? 0);
  const tickets = Number(totales.tickets ?? 0);
  const facturacion_total = Number(totales.facturacion_total ?? 0);

  return {
    personas,
    tickets,
    facturacion_total,
    promedio: personas > 0 ? facturacion_total / personas : 0,
  };
}

export type SegmentacionPorTurno = {
  tm: Segmentacion;
  tt: Segmentacion;
  total: Segmentacion;
};

export async function segmentacionPorTurno(desde: string, hasta: string, minutosCorte?: number): Promise<SegmentacionPorTurno> {
  const [tm, tt, total] = await Promise.all([
    segmentacionPeriodo(desde, hasta, minutosCorte, COD_USU_TM),
    segmentacionPeriodo(desde, hasta, minutosCorte, COD_USU_TT),
    segmentacionPeriodo(desde, hasta, minutosCorte),
  ]);
  return { tm, tt, total };
}
