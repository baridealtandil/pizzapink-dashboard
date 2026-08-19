import type { MiddlewareHandler } from "hono";
import { createHmac } from "crypto";

const SECRET = process.env.DASHBOARD_PASSWORD || "ideal-secret-fallback";

export function login(password: string): string | null {
  if (password !== process.env.DASHBOARD_PASSWORD) return null;
  // Generate a stateless token that lasts 100 years (practically permanent)
  const expiresAt = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
  const hmac = createHmac("sha256", SECRET);
  hmac.update(expiresAt.toString());
  const signature = hmac.digest("hex");
  return `${expiresAt}.${signature}`;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  
  try {
    const [expiresAtStr, signature] = token.split(".");
    if (!expiresAtStr || !signature) {
      return c.json({ error: "No autorizado" }, 401);
    }
    const expiresAt = parseInt(expiresAtStr, 10);
    if (expiresAt < Date.now()) {
      return c.json({ error: "No autorizado" }, 401);
    }
    const hmac = createHmac("sha256", SECRET);
    hmac.update(expiresAtStr);
    const expectedSignature = hmac.digest("hex");
    if (signature !== expectedSignature) {
      return c.json({ error: "No autorizado" }, 401);
    }
  } catch (e) {
    return c.json({ error: "No autorizado" }, 401);
  }

  await next();
};
