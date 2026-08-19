import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { ejecutarSqlSeguro } from "../chat/sqlTool";
import { SYSTEM_PROMPT } from "../chat/systemPrompt";
import { nowArg, todayArg, addDays } from "../utils/dates";

export const chat = new Hono();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-sonnet-5";
const MAX_TURNOS_HERRAMIENTA = 10;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ejecutar_sql",
    description:
      "Ejecuta una consulta SELECT de solo lectura contra la base MariaDB de Maxirest y devuelve las filas. Solo SELECT, una sentencia por llamada.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "La consulta SQL SELECT a ejecutar." },
      },
      required: ["query"],
    },
  },
];

type MensajeSimple = { role: "user" | "assistant"; content: string };

chat.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const mensaje: string = body.mensaje ?? "";
  const historial: MensajeSimple[] = Array.isArray(body.historial) ? body.historial : [];

  if (!mensaje.trim()) {
    return c.json({ error: "El mensaje no puede estar vacío" }, 400);
  }

  const messages: Anthropic.MessageParam[] = [
    ...historial.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: mensaje },
  ];

  // El reloj del servidor de MySQL no siempre coincide con el día calendario real de
  // Argentina (mismo problema que ya causó bugs en el fichaje). Le damos la fecha exacta
  // en vez de dejar que el modelo use CURDATE()/NOW() en sus propias consultas.
  // "HOY" acá es el día LABORAL (7 AM a 3 AM +1), no el día de calendario crudo.
  const { time: horaActual, datetime } = nowArg();
  const hoy = todayArg();
  const contextoFecha = `\n\nFecha y hora actuales en Argentina: ${datetime}. Un día laboral en Bar Ideal arranca a las 7:00 y termina a las 3:00 del día siguiente (el bar cierra cerca de las 2 AM). Por eso "HOY" en términos de día laboral es ${hoy}${horaActual < "03:00:00" ? " (ya pasó la medianoche, pero como todavía no son las 3 AM seguimos dentro del día laboral de ayer calendario)" : ""}. AYER (día laboral) = ${addDays(hoy, -1)}. NUNCA uses CURDATE(), NOW() o CURRENT_DATE en tus consultas SQL para determinar la fecha actual, ni asumas que el día laboral corta a medianoche — el reloj del servidor de base de datos puede no coincidir con este valor. Usá siempre estas fechas literales (o las que vos calcules a partir de ellas) en tus WHERE.`;

  let ultimaRespuesta: Anthropic.Message | null = null;

  for (let turno = 0; turno < MAX_TURNOS_HERRAMIENTA; turno++) {
    const respuesta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      // El diccionario de la base es grande y siempre igual — se cachea para no pagarlo
      // de nuevo en cada vuelta del loop de herramientas ni en la próxima pregunta (5 min de TTL).
      // La fecha/hora sí cambia por request, va aparte sin cache.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextoFecha },
      ],
      tools: TOOLS,
      messages,
    });

    ultimaRespuesta = respuesta;

    if (respuesta.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: respuesta.content });

    const resultadosHerramientas: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of respuesta.content) {
      if (bloque.type !== "tool_use" || bloque.name !== "ejecutar_sql") continue;
      const consultaSql = String((bloque.input as { query?: string }).query ?? "");
      const resultado = await ejecutarSqlSeguro(consultaSql);
      resultadosHerramientas.push({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: JSON.stringify(resultado),
        is_error: !resultado.ok,
      });
    }
    messages.push({ role: "user", content: resultadosHerramientas });
  }

  let textoFinal =
    ultimaRespuesta?.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n") ?? "";

  if (!textoFinal.trim()) {
    textoFinal = "La consulta requiere analizar demasiados datos históricos y superó mi límite de tiempo. Por favor, sé más específico o pedime un rango de fechas más corto (ej. 'el último mes').";
  }

  return c.json({ respuesta: textoFinal });
});
