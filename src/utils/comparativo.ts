export type Sentido = "bueno" | "malo" | "neutro";

// sube_es_bueno: true para ventas/ocupación (subir = bueno), false para descuentos/deudas (subir = malo).
export function comparativo(actual: number, comparado: number, subeEsBueno: boolean) {
  const variacion_importe = actual - comparado;
  const variacion_pct = comparado !== 0 ? (variacion_importe / comparado) * 100 : null;

  let sentido: Sentido = "neutro";
  if (variacion_importe !== 0) {
    const sube = variacion_importe > 0;
    sentido = sube === subeEsBueno ? "bueno" : "malo";
  }

  return { actual, comparado, variacion_importe, variacion_pct, sentido };
}
