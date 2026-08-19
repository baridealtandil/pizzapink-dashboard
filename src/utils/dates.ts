const TZ = "America/Argentina/Buenos_Aires";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function argParts(d: Date) {
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

// Fecha y hora actual en Argentina, sin depender del timezone del proceso (Railway corre en UTC).
export function nowArg() {
  const { date, time } = argParts(new Date());
  return { date, time, datetime: `${date} ${time}` };
}

// Suma/resta días a una fecha 'YYYY-MM-DD' usando ancla UTC (Argentina no tiene DST, offset fijo -3).
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Un "día laboral" en Bar Ideal arranca a las 7:00 y termina a las 3:00 del día siguiente
// (el bar cierra cerca de las 2 AM; 3 AM es el margen de seguridad que pidió Gabriel).
// Entre las 00:00 y las 02:59 todavía estamos DENTRO del día laboral que empezó ayer.
const CORTE_DIA_LABORAL_HORA = 3;

// "Hoy" en términos de día laboral, no de calendario — si son las 00:17, el día laboral
// en curso sigue siendo el de ayer (calendario) hasta que pasen las 3 AM.
export function todayArg(): string {
  const { date, time } = nowArg();
  const hora = Number(time.slice(0, 2));
  return hora < CORTE_DIA_LABORAL_HORA ? addDays(date, -1) : date;
}

// Minutos transcurridos desde la apertura (7:00) de un día laboral, dado un "HH:MM" cualquiera.
// hora_ent/hora_sal pueden caer en la madrugada del día siguiente (00:00-02:59), que en
// términos de día laboral es "tarde" (17-20hs después de abrir), no "temprano".
export function minutosDesdeApertura(horaHHMM: string): number {
  const [h, m] = horaHHMM.split(":").map(Number);
  return h >= CORTE_DIA_LABORAL_HORA ? (h - 7) * 60 + m : (17 + h) * 60 + m;
}

// Expresión SQL equivalente a minutosDesdeApertura(), para usar en WHERE/comparaciones dentro de queries.
export function sqlMinutosDesdeApertura(columna: string): string {
  return `(CASE WHEN HOUR(${columna}) >= ${CORTE_DIA_LABORAL_HORA} THEN (HOUR(${columna})-7)*60+MINUTE(${columna}) ELSE (17+HOUR(${columna}))*60+MINUTE(${columna}) END)`;
}

export function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = domingo
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

export function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

export function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isPastRange(hasta: string): boolean {
  return hasta < todayArg();
}
