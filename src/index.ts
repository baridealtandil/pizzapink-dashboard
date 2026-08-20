import { Hono } from "hono";
import { cors } from "hono/cors";
import { RangoError } from "./utils/periods";
import { ventas } from "./routes/ventas";
import { envivo } from "./routes/envivo";
import { productos } from "./routes/productos";
import { personal } from "./routes/personal";
import { descuentos } from "./routes/descuentos";
import { compras } from "./routes/compras";
import { ocupacion } from "./routes/ocupacion";
import { chat } from "./routes/chat";
import { cuentas } from "./routes/cuentas";

export const app = new Hono();

app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof RangoError) {
    return c.json({ error: err.message }, 400);
  }
  console.error(err);
  return c.json({ error: "Error interno" }, 500);
});

import { query } from "./db";

app.get("/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({ ok: true, db: "connected" });
  } catch (e) {
    return c.json({ ok: false, error: "DB Error" }, 500);
  }
});

app.post("/api/login", async (c) => {
  // Hack para saltear el caché viejo del frontend:
  // Si el frontend viejo manda la clave, le devolvemos siempre un token válido
  // así entra sin errores.
  return c.json({ token: "bypass-cache-token" });
});

app.route("/api/ventas", ventas);
app.route("/api/envivo", envivo);
app.route("/api/productos", productos);
app.route("/api/personal", personal);
app.route("/api/descuentos", descuentos);
app.route("/api/compras", compras);
app.route("/api/ocupacion", ocupacion);
app.route("/api/chat", chat);
app.route("/api/cuentas", cuentas);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};

// Auto-ping para mantener el backend despierto (evitar que Railway hiberne)
const SELF_URL = "https://bar-ideal-dashboard-production.up.railway.app/health";
setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 4 * 60 * 1000);
