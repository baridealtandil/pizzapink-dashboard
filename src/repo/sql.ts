// mxfac = facturación histórica cerrada, mxtufac = turno actual en vivo (mismo esquema).
// Unimos ambas para que cualquier rango que toque "hoy" incluya la venta en curso.
export const FAC_UNION = `
  SELECT fecha, hora_ent, hora_sal, turno, mesa, cod_emp, cod_usu, cod_cli, cod_dto, imp_dto, total,
         COALESCE(neto1,0)+COALESCE(neto2,0)+COALESCE(neto3,0) AS neto,
         cod_cpb, prefijo, numero, cubiertos
  FROM mxfac
  UNION ALL
  SELECT fecha, hora_ent, hora_sal, turno, mesa, cod_emp, cod_usu, cod_cli, cod_dto, imp_dto, total,
         COALESCE(neto1,0)+COALESCE(neto2,0)+COALESCE(neto3,0) AS neto,
         cod_cpb, prefijo, numero, cubiertos
  FROM mxtufac
`;

// cod_usu identifica el cajero/turno de caja: 6 = Turno Mañana (TM, almuerzo), 7 = Turno Tarde/Noche (TT, cena).
// Confirmado contra la base real: 100% de los comprobantes recientes caen en uno de estos dos.
export const COD_USU_TM = 6;
export const COD_USU_TT = 7;

export const ITE_UNION = `
  SELECT fecha, cod_cpb, prefijo, numero, cod_art, cantidad, precio, cod_dto, imp_dto
  FROM mxite
  UNION ALL
  SELECT fecha, cod_cpb, prefijo, numero, cod_art, cantidad, precio, cod_dto, imp_dto
  FROM mxtuite
`;

// Mismo criterio que ya usa el bot de estadísticas de Telegram (no es una franja horaria).

export const CM2_UNION = `
  SELECT fecha, turno, hora_ped, duracion, numero, mesa, mozo, cod_art, cantidad, cubiertos
  FROM mxcm2
  UNION ALL
  SELECT fecha, turno, hora_ped, duracion, numero, mesa, mozo, cod_art, cantidad, cubiertos
  FROM mxtucm2
`;
