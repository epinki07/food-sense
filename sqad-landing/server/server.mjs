import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuthService, sanitizeSession } from "./auth-service.mjs";
import { ContactService } from "./contact-service.mjs";
import { Esp32HistoryService } from "./esp32-history-service.mjs";
import { Esp32StreamService, validateEsp32SourceUrl } from "./esp32-stream-service.mjs";
import { ImageCacheService } from "./image-cache-service.mjs";
import { MetricsService } from "./metrics-service.mjs";
import { getClientAddress, RateLimiter } from "./rate-limit-service.mjs";
import { StaticService } from "./static-service.mjs";
import { json, noContent, readJsonBody, withSecurityHeaders } from "./utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const loadEnvFromFile = (envPath) => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }

    const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = normalizedValue;
  });
};

loadEnvFromFile(path.join(ROOT_DIR, ".env"));

const resolveStaticRoot = () => {
  if (process.env.SQAD_STATIC_ROOT) {
    return path.resolve(process.env.SQAD_STATIC_ROOT);
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    return DIST_DIR;
  }
  return ROOT_DIR;
};

export const createSqadServer = (options = {}) => {
  const staticRoot = options.staticRoot || resolveStaticRoot();
  const auth = new AuthService();
  const contact = new ContactService();
  const esp32History = new Esp32HistoryService();
  const esp32 = new Esp32StreamService();
  const images = new ImageCacheService();
  const metrics = new MetricsService(ROOT_DIR);
  const staticService = new StaticService(staticRoot);
  const loginRateLimiter = new RateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 10,
    name: "auth-login"
  });
  const metricsRateLimiter = new RateLimiter({
    windowMs: 60 * 1000,
    max: 200,
    name: "metrics"
  });
  const streamRateLimiter = new RateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    name: "esp32-stream"
  });
  const esp32SubmitRateLimiter = new RateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    name: "esp32-submit"
  });
  const contactRateLimiter = new RateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 12,
    name: "contact"
  });

  const enforceRateLimit = (req, res, limiter, suffix = "") => {
    const clientIp = getClientAddress(req);
    const key = suffix ? `${clientIp}:${suffix}` : clientIp;
    const status = limiter.consume(key);
    res.setHeader("X-RateLimit-Limit", String(status.limit));
    res.setHeader("X-RateLimit-Remaining", String(status.remaining));
    if (!status.allowed) {
      res.setHeader("Retry-After", String(status.retryAfterSec));
      json(res, 429, {
        error: "Demasiadas solicitudes. Intente nuevamente en unos segundos."
      });
      return false;
    }
    return true;
  };

  const server = http.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/auth/login" && method === "POST") {
      if (!enforceRateLimit(req, res, loginRateLimiter, "login")) {
        return;
      }
      try {
        const body = await readJsonBody(req);
        const username = String(body.username || "").trim();
        const password = String(body.password || "");

        if (!username || !password) {
          json(res, 400, { error: "Ingrese usuario y contraseña." });
          return;
        }

        const valid = auth.verifyCredentials(username, password);
        if (!valid) {
          json(res, 401, { error: "Credenciales inválidas." });
          return;
        }

        const session = auth.createSession(username);
        auth.setSessionCookie(res, session, req);
        json(res, 200, {
          authenticated: true,
          session: sanitizeSession(session)
        });
      } catch (error) {
        json(res, 400, { error: error.message || "Solicitud inválida." });
      }
      return;
    }

    if (requestUrl.pathname === "/api/auth/session" && method === "GET") {
      const session = auth.getSessionFromRequest(req);
      if (!session) {
        json(res, 200, { authenticated: false });
        return;
      }
      json(res, 200, {
        authenticated: true,
        session: sanitizeSession(session)
      });
      return;
    }

    if (requestUrl.pathname === "/api/auth/logout" && method === "POST") {
      auth.logout(req, res);
      json(res, 200, { authenticated: false });
      return;
    }

    if ((requestUrl.pathname === "/api/esp32/data" || requestUrl.pathname === "/data") && method === "GET") {
      try {
        const limit = Number(requestUrl.searchParams.get("limit") || 50);
        const rows = await esp32History.getLatestData(limit);
        json(res, 200, rows);
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 500;
        const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
        json(res, safeStatus, { error: error?.message || "Error al consultar datos ESP32." });
      }
      return;
    }

    if ((requestUrl.pathname === "/api/esp32/history" || requestUrl.pathname === "/history") && method === "GET") {
      try {
        const sensor = String(requestUrl.searchParams.get("sensor") || "");
        const limit = Number(requestUrl.searchParams.get("limit") || 10);
        const rows = await esp32History.getHistory({ sensor, limit });
        json(res, 200, rows);
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 500;
        const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
        json(res, safeStatus, { error: error?.message || "Error al consultar historial ESP32." });
      }
      return;
    }

    if ((requestUrl.pathname === "/api/esp32/submit" || requestUrl.pathname === "/submit") && method === "POST") {
      if (!enforceRateLimit(req, res, esp32SubmitRateLimiter, "esp32-submit")) {
        return;
      }
      try {
        const payload = await readJsonBody(req, 32 * 1024);
        const result = await esp32History.submitMeasurement(payload);
        json(res, 200, result);
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 500;
        const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
        json(res, safeStatus, {
          success: false,
          message: error?.message || "Error al registrar datos ESP32."
        });
      }
      return;
    }

    if (requestUrl.pathname === "/api/esp32/stream" && method === "GET") {
      if (!enforceRateLimit(req, res, streamRateLimiter, "stream")) {
        return;
      }
      const session = auth.getSessionFromRequest(req);
      if (!session) {
        json(res, 401, { error: "No autorizado." });
        return;
      }

      const sourceUrl = String(requestUrl.searchParams.get("url") || "");
      const intervalMs = Number(requestUrl.searchParams.get("interval") || 2500);
      const sourceValidation = validateEsp32SourceUrl(sourceUrl);
      if (!sourceValidation.ok) {
        json(res, 400, { error: sourceValidation.error });
        return;
      }
      esp32.open({
        req,
        res,
        sourceUrl: sourceValidation.normalizedUrl,
        intervalMs
      });
      return;
    }

    if (requestUrl.pathname === "/api/image" && method === "GET") {
      const source = String(requestUrl.searchParams.get("src") || "");
      if (!source) {
        json(res, 400, { error: "Parámetro src requerido." });
        return;
      }

      try {
        const image = await images.getImage(source);
        res.writeHead(200, withSecurityHeaders({
          "Content-Type": image.contentType,
          "Cache-Control": "public, max-age=86400, immutable",
          ETag: image.etag
        }));
        res.end(image.buffer);
      } catch (error) {
        json(res, 400, { error: error.message || "No fue posible cargar la imagen." });
      }
      return;
    }

    if (requestUrl.pathname === "/api/contact" && method === "POST") {
      if (!enforceRateLimit(req, res, contactRateLimiter, "contact")) {
        return;
      }
      try {
        const payload = await readJsonBody(req, 40 * 1024);
        const delivery = await contact.deliver(payload);
        json(res, 200, { ok: true, provider: delivery.provider });
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 502;
        const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 502;
        json(res, safeStatus, {
          error: error?.message || "No fue posible enviar la solicitud."
        });
      }
      return;
    }

    if (requestUrl.pathname === "/api/metrics" && method === "POST") {
      if (!enforceRateLimit(req, res, metricsRateLimiter, "metrics")) {
        return;
      }
      try {
        const payload = await readJsonBody(req);
        metrics.record(payload);
        noContent(res, 204);
      } catch {
        json(res, 400, { error: "Payload inválido." });
      }
      return;
    }

    if (requestUrl.pathname === "/api/metrics/summary" && method === "GET") {
      const session = auth.getSessionFromRequest(req);
      if (!session) {
        json(res, 401, { error: "No autorizado." });
        return;
      }

      json(res, 200, metrics.summary());
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      json(res, 404, { error: "Endpoint no encontrado." });
      return;
    }

    staticService.serve(req, res, requestUrl.pathname);
  });

  server.on("close", () => {
    auth.dispose();
    loginRateLimiter.dispose();
    metricsRateLimiter.dispose();
    streamRateLimiter.dispose();
    esp32SubmitRateLimiter.dispose();
    contactRateLimiter.dispose();
    void esp32History.dispose();
  });

  return server;
};

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
})();

if (isDirectRun) {
  const port = Number(process.env.PORT || 3000);
  const server = createSqadServer();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`SQAD server running at http://localhost:${port}`);
  });
}
