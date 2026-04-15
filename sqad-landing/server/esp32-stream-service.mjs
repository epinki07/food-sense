import net from "node:net";
import { safeNumber } from "./utils.mjs";

const flattenObject = (input, prefix = "", bag = {}) => {
  if (input === null || input === undefined) {
    return bag;
  }

  if (Array.isArray(input)) {
    input.forEach((value, index) => {
      const key = prefix ? `${prefix}.${index}` : String(index);
      flattenObject(value, key, bag);
    });
    return bag;
  }

  if (typeof input === "object") {
    Object.entries(input).forEach(([key, value]) => {
      const safeKey = key.toLowerCase();
      const nextPrefix = prefix ? `${prefix}.${safeKey}` : safeKey;
      flattenObject(value, nextPrefix, bag);
    });
    return bag;
  }

  bag[prefix] = input;
  return bag;
};

const pickByAlias = (flatObject, aliases) => {
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));
  for (const [key, value] of Object.entries(flatObject)) {
    const lastSegment = key.split(".").pop() || "";
    if (aliasSet.has(lastSegment)) {
      return value;
    }
  }
  return undefined;
};

const SENSOR_ALIASES = {
  temperature: [
    "temperature",
    "temp",
    "temperatura",
    "t",
    "temperaturec",
    "temperature_c",
    "tempc",
    "dht_temperature",
    "celsius"
  ],
  humidity: [
    "humidity",
    "humedad",
    "hum",
    "h",
    "humiditypct",
    "humidity_pct",
    "dht_humidity",
    "rh",
    "relativehumidity"
  ],
  gas: [
    "gas",
    "co2",
    "co2ppm",
    "ppm",
    "mq",
    "mq2",
    "mq135",
    "mq_135",
    "airquality",
    "air_quality",
    "quality",
    "voc",
    "tvoc"
  ],
  motion: [
    "motion",
    "estado",
    "status",
    "door",
    "puerta",
    "doorstate",
    "door_state",
    "open",
    "isopen",
    "condition"
  ],
  timestamp: [
    "timestamp",
    "time",
    "ts",
    "updatedat",
    "updated_at",
    "datetime",
    "date",
    "fecha",
    "lastupdate",
    "last_update"
  ]
};

export const normalizeEsp32Payload = (payload) => {
  const flattened = flattenObject(payload);
  return {
    temperature: pickByAlias(flattened, SENSOR_ALIASES.temperature),
    humidity: pickByAlias(flattened, SENSOR_ALIASES.humidity),
    gas: pickByAlias(flattened, SENSOR_ALIASES.gas),
    motion: pickByAlias(flattened, SENSOR_ALIASES.motion),
    timestamp: pickByAlias(flattened, SENSOR_ALIASES.timestamp),
    raw: payload
  };
};

const normalizeTokenKey = (rawKey) => {
  return String(rawKey || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const coerceScalar = (rawValue) => {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }

  const numeric = trimmed.replace(",", ".").replace(/[^0-9.+-]/g, "");
  if (/[0-9]/.test(trimmed) && numeric && !/^[-+.]$/.test(numeric)) {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return trimmed;
};

const parseDelimitedKeyValue = (text) => {
  const bag = {};
  const chunks = String(text || "").split(/[\n;,]+/);
  chunks.forEach((chunk) => {
    const match = chunk.match(/^\s*([A-Za-zÀ-ÿ0-9_\-/\s]+?)\s*[:=]\s*(.+)\s*$/);
    if (!match) {
      return;
    }
    const key = normalizeTokenKey(match[1]);
    if (!key) {
      return;
    }
    bag[key] = coerceScalar(match[2]);
  });

  return Object.keys(bag).length ? bag : null;
};

const parseNumericTuple = (text) => {
  const matches = String(text || "").match(/[-+]?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) {
    return null;
  }

  const values = matches
    .map((value) => Number(String(value).replace(",", ".")))
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) {
    return null;
  }

  const payload = {
    temperature: values[0],
    humidity: values[1]
  };
  if (values.length >= 3) {
    payload.gas = values[2];
  }
  return payload;
};

export const parseEsp32ResponseBody = (bodyText) => {
  const text = String(bodyText || "").trim();
  if (!text) {
    throw new Error("Respuesta vacía del ESP32.");
  }

  try {
    const asJson = JSON.parse(text);
    if (asJson && typeof asJson === "object") {
      return asJson;
    }
  } catch {
    // no-op: fallback parsers below
  }

  const asPairs = parseDelimitedKeyValue(text);
  if (asPairs) {
    return asPairs;
  }

  const asTuple = parseNumericTuple(text);
  if (asTuple) {
    return asTuple;
  }

  return { raw_text: text };
};

const fallbackSample = () => {
  const baseTemp = 3.4 + Math.random() * 2.8;
  const baseHum = 62 + Math.random() * 14;
  const baseGas = 410 + Math.random() * 85;
  return {
    temperature: Number(baseTemp.toFixed(2)),
    humidity: Number(baseHum.toFixed(2)),
    gas: Number(baseGas.toFixed(1)),
    motion: Math.random() > 0.5 ? "Puerta cerrada" : "Puerta en uso",
    timestamp: new Date().toISOString(),
    raw: {
      simulated: true
    }
  };
};

const BLOCKED_HOSTS = new Set([
  "169.254.169.254", // AWS/Azure metadata
  "100.100.100.200", // Alibaba metadata
  "metadata.google.internal",
  "metadata",
  "latest"
]);

const splitAllowlist = (raw = "") => {
  return String(raw)
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
};

const hostMatchesAllowlist = (hostname, allowlist) => {
  const normalizedHost = String(hostname || "").toLowerCase().replace(/\.$/, "");
  for (const entry of allowlist) {
    if (entry.startsWith("*.")) {
      const domain = entry.slice(2);
      if (domain && normalizedHost.endsWith(`.${domain}`)) {
        return true;
      }
      continue;
    }
    if (entry === normalizedHost) {
      return true;
    }
  }
  return false;
};

const parseIpv4 = (hostname) => {
  const parts = String(hostname || "")
    .split(".")
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

const isIpv4Loopback = (hostname) => {
  const parts = parseIpv4(hostname);
  return Boolean(parts && parts[0] === 127);
};

const isIpv4Private = (hostname) => {
  const parts = parseIpv4(hostname);
  if (!parts) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};

const isIpv4LinkLocal = (hostname) => {
  const parts = parseIpv4(hostname);
  return Boolean(parts && parts[0] === 169 && parts[1] === 254);
};

const isIpv6Loopback = (hostname) => {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
};

const isIpv6Private = (hostname) => /^f[cd]/i.test(String(hostname || ""));
const isIpv6LinkLocal = (hostname) => /^fe[89ab]/i.test(String(hostname || ""));

const isLocalHostname = (hostname) => {
  const normalized = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".local") || !normalized.includes(".");
};

const allowConfigFromEnv = () => {
  const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
  const isProduction = nodeEnv === "production";
  return {
    allowLoopback: process.env.SQAD_ESP32_ALLOW_LOOPBACK
      ? process.env.SQAD_ESP32_ALLOW_LOOPBACK === "1"
      : !isProduction,
    allowPrivate: process.env.SQAD_ESP32_ALLOW_PRIVATE
      ? process.env.SQAD_ESP32_ALLOW_PRIVATE === "1"
      : true,
    allowLinkLocal: process.env.SQAD_ESP32_ALLOW_LINK_LOCAL
      ? process.env.SQAD_ESP32_ALLOW_LINK_LOCAL === "1"
      : true,
    allowPublic: process.env.SQAD_ESP32_ALLOW_PUBLIC
      ? process.env.SQAD_ESP32_ALLOW_PUBLIC === "1"
      : false,
    allowlist: splitAllowlist(process.env.SQAD_ESP32_ALLOWLIST || "")
  };
};

export const validateEsp32SourceUrl = (rawUrl, overrides = {}) => {
  const source = String(rawUrl || "").trim();
  if (!source) {
    return { ok: true, normalizedUrl: "" };
  }

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return { ok: false, error: "URL del ESP32 inválida." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Solo se permiten protocolos HTTP/HTTPS." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "No se permiten credenciales embebidas en la URL." };
  }

  const host = String(parsed.hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) {
    return { ok: false, error: "Host del ESP32 inválido." };
  }

  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: "Host bloqueado por seguridad." };
  }

  const config = {
    ...allowConfigFromEnv(),
    ...overrides
  };
  const allowlist = Array.isArray(config.allowlist) ? config.allowlist : splitAllowlist(config.allowlist);
  if (hostMatchesAllowlist(host, allowlist)) {
    return { ok: true, normalizedUrl: parsed.toString() };
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    if (isIpv4Loopback(host) && !config.allowLoopback) {
      return { ok: false, error: "Loopback bloqueado. Configure SQAD_ESP32_ALLOW_LOOPBACK=1." };
    }
    if (isIpv4LinkLocal(host) && !config.allowLinkLocal) {
      return { ok: false, error: "Link-local bloqueado. Configure SQAD_ESP32_ALLOW_LINK_LOCAL=1." };
    }
    if (isIpv4Private(host) && !config.allowPrivate) {
      return { ok: false, error: "Red privada bloqueada. Configure SQAD_ESP32_ALLOW_PRIVATE=1." };
    }
    if (!isIpv4Private(host) && !isIpv4Loopback(host) && !isIpv4LinkLocal(host) && !config.allowPublic) {
      return { ok: false, error: "Host público no permitido. Use SQAD_ESP32_ALLOWLIST o SQAD_ESP32_ALLOW_PUBLIC=1." };
    }
    return { ok: true, normalizedUrl: parsed.toString() };
  }

  if (ipVersion === 6) {
    if (isIpv6Loopback(host) && !config.allowLoopback) {
      return { ok: false, error: "Loopback IPv6 bloqueado." };
    }
    if (isIpv6LinkLocal(host) && !config.allowLinkLocal) {
      return { ok: false, error: "IPv6 link-local bloqueado." };
    }
    if (isIpv6Private(host) && !config.allowPrivate) {
      return { ok: false, error: "IPv6 privado bloqueado." };
    }
    if (!isIpv6Private(host) && !isIpv6Loopback(host) && !isIpv6LinkLocal(host) && !config.allowPublic) {
      return { ok: false, error: "IPv6 público no permitido." };
    }
    return { ok: true, normalizedUrl: parsed.toString() };
  }

  if (isLocalHostname(host) && !config.allowLoopback && !config.allowPrivate) {
    return { ok: false, error: "Hosts locales bloqueados por configuración." };
  }

  if (isLocalHostname(host)) {
    return { ok: true, normalizedUrl: parsed.toString() };
  }

  if (!config.allowPublic) {
    return { ok: false, error: "Host público no permitido. Defina SQAD_ESP32_ALLOWLIST." };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
};

export class Esp32StreamService {
  open({ req, res, sourceUrl, intervalMs }) {
    const interval = Math.min(Math.max(safeNumber(intervalMs, 2500), 800), 60000);
    const sourceValidation = validateEsp32SourceUrl(sourceUrl);
    const targetUrl = sourceValidation.ok ? sourceValidation.normalizedUrl : "";

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write("retry: 2000\n\n");

    let timer = 0;
    let closed = false;

    const send = (payload) => {
      if (closed) {
        return;
      }
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const fetchPayload = async () => {
      if (!targetUrl) {
        send({
          ok: false,
          message: sourceValidation.ok
            ? "Sin endpoint remoto. Mostrando señal simulada."
            : `${sourceValidation.error} Mostrando señal simulada.`,
          data: fallbackSample()
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 5000);

      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rawBody = await response.text();
        const payload = parseEsp32ResponseBody(rawBody);
        const normalizedPayload = normalizeEsp32Payload(payload);
        const hasKnownSignal = [
          normalizedPayload.temperature,
          normalizedPayload.humidity,
          normalizedPayload.gas,
          normalizedPayload.motion,
          normalizedPayload.timestamp
        ].some((value) => {
          if (value === undefined || value === null) {
            return false;
          }
          return String(value).trim() !== "";
        });

        if (!hasKnownSignal) {
          throw new Error("Formato de respuesta no reconocido");
        }

        send({
          ok: true,
          message: "Lectura remota recibida.",
          data: normalizedPayload
        });
      } catch (error) {
        send({
          ok: false,
          message: `Lectura remota no disponible (${error.message || "error"}). Señal simulada activa.`,
          data: fallbackSample()
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    fetchPayload();
    timer = setInterval(fetchPayload, interval);

    const closeStream = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(timer);
      res.end();
    };

    req.on("close", closeStream);
    req.on("aborted", closeStream);
  }
}
