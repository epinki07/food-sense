import assert from "node:assert/strict";
import test from "node:test";
import { AuthService, sanitizeSession } from "../server/auth-service.mjs";
import { ContactService } from "../server/contact-service.mjs";
import { normalizeEsp32Payload, parseEsp32ResponseBody, validateEsp32SourceUrl } from "../server/esp32-stream-service.mjs";
import { MetricsService } from "../server/metrics-service.mjs";
import { RateLimiter } from "../server/rate-limit-service.mjs";
import { StaticService } from "../server/static-service.mjs";
import { parseCookies } from "../server/utils.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const mockResponse = () => {
  const headers = new Map();
  return {
    setHeader(name, value) {
      headers.set(name, value);
    },
    getHeader(name) {
      return headers.get(name);
    }
  };
};

test("auth validates credentials securely", () => {
  const auth = new AuthService();
  assert.equal(auth.verifyCredentials("diegopro", "123456"), true);
  assert.equal(auth.verifyCredentials("diegopro", "wrong"), false);
  assert.equal(auth.verifyCredentials("other", "123456"), false);
  auth.dispose();
});

test("auth creates session cookie and resolves request session", () => {
  const auth = new AuthService();
  const session = auth.createSession("diegopro");
  const res = mockResponse();
  const req = { headers: {} };
  auth.setSessionCookie(res, session, req);

  const setCookieHeader = res.getHeader("Set-Cookie");
  assert.ok(Array.isArray(setCookieHeader));
  const cookie = String(setCookieHeader[0] || "");
  const sid = cookie.split(";")[0].split("=")[1];
  assert.ok(sid);

  const sessionReq = {
    headers: {
      cookie: `sqad_sid=${sid}`
    }
  };

  const resolved = auth.getSessionFromRequest(sessionReq);
  assert.ok(resolved);
  assert.equal(resolved.username, "diegopro");

  auth.logout(sessionReq, res);
  assert.equal(auth.getSessionFromRequest(sessionReq), null);
  auth.dispose();
});

test("sanitizeSession exposes only safe fields", () => {
  const sanitized = sanitizeSession({ username: "diegopro", createdAt: Date.now() });
  assert.equal(sanitized.username, "diegopro");
  assert.equal(typeof sanitized.signedAt, "string");
  assert.equal(sanitizeSession(null), null);
});

test("metrics service stores and summarizes values", () => {
  const metrics = new MetricsService(root);
  metrics.record({ name: "lcp", value: 2000 });
  metrics.record({ name: "lcp", value: 1800 });
  metrics.record({ name: "cls", value: 0.12 });

  const summary = metrics.summary();
  assert.equal(summary.count >= 3, true);
  const lcp = summary.metrics.find((item) => item.name === "lcp");
  assert.ok(lcp);
  assert.equal(lcp.count >= 2, true);
});

test("rate limiter blocks abusive bursts", () => {
  const limiter = new RateLimiter({
    windowMs: 1000,
    max: 2,
    name: "test"
  });

  assert.equal(limiter.consume("127.0.0.1").allowed, true);
  assert.equal(limiter.consume("127.0.0.1").allowed, true);
  const blocked = limiter.consume("127.0.0.1");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec >= 1, true);
  limiter.dispose();
});

test("esp32 source validation rejects risky targets and allows private LAN", () => {
  const blockedMetadata = validateEsp32SourceUrl("http://169.254.169.254/latest/meta-data", {
    allowPublic: true,
    allowPrivate: true,
    allowLinkLocal: true,
    allowLoopback: true,
    allowlist: []
  });
  assert.equal(blockedMetadata.ok, false);

  const blockedPublic = validateEsp32SourceUrl("https://example.com/sensors", {
    allowPublic: false,
    allowPrivate: true,
    allowLinkLocal: false,
    allowLoopback: false,
    allowlist: []
  });
  assert.equal(blockedPublic.ok, false);

  const allowedPrivate = validateEsp32SourceUrl("http://192.168.1.60/sensors", {
    allowPublic: false,
    allowPrivate: true,
    allowLinkLocal: false,
    allowLoopback: false,
    allowlist: []
  });
  assert.equal(allowedPrivate.ok, true);

  const allowedLocalHost = validateEsp32SourceUrl("http://esp32.local/sensors", {
    allowPublic: false,
    allowPrivate: true,
    allowLinkLocal: true,
    allowLoopback: false,
    allowlist: []
  });
  assert.equal(allowedLocalHost.ok, true);
});

test("esp32 payload normalization supports common sensor aliases", () => {
  const normalized = normalizeEsp32Payload({
    dht: {
      temperature_c: 4.6,
      humidity_pct: 71.2
    },
    mq135: 502,
    door_state: "abierta",
    updated_at: "2026-02-28T12:00:00.000Z"
  });

  assert.equal(normalized.temperature, 4.6);
  assert.equal(normalized.humidity, 71.2);
  assert.equal(normalized.gas, 502);
  assert.equal(normalized.motion, "abierta");
  assert.equal(normalized.timestamp, "2026-02-28T12:00:00.000Z");
});

test("esp32 response parser supports key-value plain text payloads", () => {
  const parsed = parseEsp32ResponseBody("temp=5.7; humidity=68.4; mq135=430; door=closed");
  const normalized = normalizeEsp32Payload(parsed);
  assert.equal(normalized.temperature, 5.7);
  assert.equal(normalized.humidity, 68.4);
  assert.equal(normalized.gas, 430);
  assert.equal(normalized.motion, "closed");
});

test("static resolver tolerates malformed URI paths", () => {
  const staticService = new StaticService(root);
  assert.equal(staticService.resolvePath("/%E0%A4%A"), null);
  assert.equal(staticService.resolvePath("/../etc/passwd"), null);
});

test("cookie parser tolerates malformed encoded values", () => {
  const parsed = parseCookies("sqad_sid=%E0%A4%A; theme=dark");
  assert.equal(parsed.theme, "dark");
  assert.equal(parsed.sqad_sid, "%E0%A4%A");
});

test("contact service validates required commercial fields", () => {
  const contact = new ContactService();
  const invalid = contact.validate(contact.normalize({
    name: "",
    email: "correo-invalido",
    store: "",
    consent: false
  }));
  assert.equal(invalid.ok, false);

  const valid = contact.validate(contact.normalize({
    name: "Diego Ramirez",
    email: "diego@empresa.com",
    store: "Super Cadena",
    message: "Quiero piloto en 3 tiendas.",
    consent: true
  }));
  assert.equal(valid.ok, true);
});

test("contact service defaults to backend-safe captcha mode", () => {
  const previous = process.env.SQAD_CONTACT_CAPTCHA;
  delete process.env.SQAD_CONTACT_CAPTCHA;
  const contact = new ContactService();
  assert.equal(contact.requireCaptcha, false);
  if (previous !== undefined) {
    process.env.SQAD_CONTACT_CAPTCHA = previous;
  }
});

test("contact service sends to fixed destination and uses lead email as reply-to", async () => {
  const previousProvider = process.env.SQAD_CONTACT_PROVIDER;
  const previousTo = process.env.SQAD_CONTACT_TO;
  const previousFrom = process.env.SQAD_CONTACT_FROM;
  const previousBase = process.env.SQAD_CONTACT_FORMSUBMIT_BASE;
  const originalFetch = globalThis.fetch;

  process.env.SQAD_CONTACT_PROVIDER = "formsubmit";
  process.env.SQAD_CONTACT_TO = "fallback@sqad.mx";
  process.env.SQAD_CONTACT_FROM = "dramirezmagana@gmail.com";
  process.env.SQAD_CONTACT_FORMSUBMIT_BASE = "https://formsubmit.co/ajax";

  let requestedUrl = "";
  let payloadEmail = "";
  let payloadDestination = "";
  let payloadReplyTo = "";
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url || "");
    const body = options.body;
    if (body && typeof body.get === "function") {
      payloadEmail = String(body.get("email") || "");
      payloadDestination = String(body.get("destination_email") || "");
      payloadReplyTo = String(body.get("_replyto") || "");
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true })
    };
  };

  try {
    const contact = new ContactService();
    await contact.deliver({
      name: "Diego Ramirez",
      email: "contacto@empresa.com",
      store: "Super Cadena",
      message: "Prueba de contacto comercial.",
      consent: true
    });
    assert.equal(
      requestedUrl,
      "https://formsubmit.co/ajax/fallback%40sqad.mx"
    );
    assert.equal(payloadEmail, "dramirezmagana@gmail.com");
    assert.equal(payloadReplyTo, "contacto@empresa.com");
    assert.equal(payloadDestination, "fallback@sqad.mx");
  } finally {
    globalThis.fetch = originalFetch;

    if (previousProvider === undefined) {
      delete process.env.SQAD_CONTACT_PROVIDER;
    } else {
      process.env.SQAD_CONTACT_PROVIDER = previousProvider;
    }

    if (previousTo === undefined) {
      delete process.env.SQAD_CONTACT_TO;
    } else {
      process.env.SQAD_CONTACT_TO = previousTo;
    }

    if (previousFrom === undefined) {
      delete process.env.SQAD_CONTACT_FROM;
    } else {
      process.env.SQAD_CONTACT_FROM = previousFrom;
    }

    if (previousBase === undefined) {
      delete process.env.SQAD_CONTACT_FORMSUBMIT_BASE;
    } else {
      process.env.SQAD_CONTACT_FORMSUBMIT_BASE = previousBase;
    }
  }
});

test("contact service sends using SMTP provider and reply-to lead email", async () => {
  const previousProvider = process.env.SQAD_CONTACT_PROVIDER;
  const previousHost = process.env.SQAD_CONTACT_SMTP_HOST;
  const previousPort = process.env.SQAD_CONTACT_SMTP_PORT;
  const previousFrom = process.env.SQAD_CONTACT_SMTP_FROM;
  const previousTo = process.env.SQAD_CONTACT_SMTP_TO;
  const previousUser = process.env.SQAD_CONTACT_SMTP_USER;
  const previousPass = process.env.SQAD_CONTACT_SMTP_PASS;

  process.env.SQAD_CONTACT_PROVIDER = "smtp";
  process.env.SQAD_CONTACT_SMTP_HOST = "smtp.sqad.test";
  process.env.SQAD_CONTACT_SMTP_PORT = "587";
  process.env.SQAD_CONTACT_SMTP_FROM = "notificaciones@sqad.mx";
  process.env.SQAD_CONTACT_SMTP_TO = "ventas@sqad.mx";
  process.env.SQAD_CONTACT_SMTP_USER = "smtp-user";
  process.env.SQAD_CONTACT_SMTP_PASS = "smtp-pass";

  let capturedConfig = null;
  let sendMailPayload = null;
  let verifyCalled = false;

  try {
    const contact = new ContactService({
      smtpClientFactory: (config) => {
        capturedConfig = config;
        return {
          verify: async () => {
            verifyCalled = true;
          },
          sendMail: async (payload) => {
            sendMailPayload = payload;
            return {
              messageId: "msg-123",
              accepted: ["ventas@sqad.mx"],
              rejected: []
            };
          }
        };
      }
    });

    const result = await contact.deliver({
      name: "Diego Ramirez",
      email: "cliente@empresa.com",
      store: "Super Cadena",
      message: "Solicito una reunion.",
      consent: true
    });

    assert.equal(result.provider, "smtp");
    assert.equal(verifyCalled, true);
    assert.equal(capturedConfig.host, "smtp.sqad.test");
    assert.equal(capturedConfig.port, 587);
    assert.equal(capturedConfig.secure, false);
    assert.equal(capturedConfig.auth.user, "smtp-user");
    assert.equal(capturedConfig.auth.pass, "smtp-pass");
    assert.equal(sendMailPayload.from, "notificaciones@sqad.mx");
    assert.equal(sendMailPayload.to, "ventas@sqad.mx");
    assert.equal(sendMailPayload.replyTo, "cliente@empresa.com");
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SQAD_CONTACT_PROVIDER;
    } else {
      process.env.SQAD_CONTACT_PROVIDER = previousProvider;
    }

    if (previousHost === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_HOST;
    } else {
      process.env.SQAD_CONTACT_SMTP_HOST = previousHost;
    }

    if (previousPort === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_PORT;
    } else {
      process.env.SQAD_CONTACT_SMTP_PORT = previousPort;
    }

    if (previousFrom === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_FROM;
    } else {
      process.env.SQAD_CONTACT_SMTP_FROM = previousFrom;
    }

    if (previousTo === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_TO;
    } else {
      process.env.SQAD_CONTACT_SMTP_TO = previousTo;
    }

    if (previousUser === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_USER;
    } else {
      process.env.SQAD_CONTACT_SMTP_USER = previousUser;
    }

    if (previousPass === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_PASS;
    } else {
      process.env.SQAD_CONTACT_SMTP_PASS = previousPass;
    }
  }
});

test("contact service sends using MailerSend API provider", async () => {
  const previousProvider = process.env.SQAD_CONTACT_PROVIDER;
  const previousToken = process.env.SQAD_CONTACT_MAILERSEND_TOKEN;
  const previousBase = process.env.SQAD_CONTACT_MAILERSEND_BASE;
  const previousFrom = process.env.SQAD_CONTACT_MAILERSEND_FROM;
  const previousFromName = process.env.SQAD_CONTACT_MAILERSEND_FROM_NAME;
  const previousTo = process.env.SQAD_CONTACT_MAILERSEND_TO;
  const originalFetch = globalThis.fetch;

  process.env.SQAD_CONTACT_PROVIDER = "mailersend";
  process.env.SQAD_CONTACT_MAILERSEND_TOKEN = "ms_test_token";
  process.env.SQAD_CONTACT_MAILERSEND_BASE = "https://api.mailersend.com/v1";
  process.env.SQAD_CONTACT_MAILERSEND_FROM = "notificaciones@sqad.mx";
  process.env.SQAD_CONTACT_MAILERSEND_FROM_NAME = "Food Sense Bot";
  process.env.SQAD_CONTACT_MAILERSEND_TO = "ventas@sqad.mx";

  let requestedUrl = "";
  let requestHeaders = {};
  let requestBody = null;
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url || "");
    requestHeaders = options.headers || {};
    try {
      requestBody = JSON.parse(String(options.body || "{}"));
    } catch {
      requestBody = null;
    }
    return {
      ok: true,
      status: 202,
      headers: {
        get(name) {
          if (String(name || "").toLowerCase() === "x-message-id") {
            return "ms-message-123";
          }
          return "";
        }
      },
      text: async () => ""
    };
  };

  try {
    const contact = new ContactService();
    const result = await contact.deliver({
      name: "Diego Ramirez",
      email: "cliente@empresa.com",
      store: "Super Cadena",
      message: "Quiero una demo.",
      consent: true
    });

    assert.equal(result.provider, "mailersend");
    assert.equal(result.providerResponse.messageId, "ms-message-123");
    assert.equal(requestedUrl, "https://api.mailersend.com/v1/email");
    assert.equal(
      requestHeaders.Authorization,
      "Bearer ms_test_token"
    );
    assert.equal(requestBody.from.email, "notificaciones@sqad.mx");
    assert.equal(requestBody.from.name, "Food Sense Bot");
    assert.equal(requestBody.to[0].email, "ventas@sqad.mx");
    assert.equal(requestBody.reply_to.email, "cliente@empresa.com");
  } finally {
    globalThis.fetch = originalFetch;

    if (previousProvider === undefined) {
      delete process.env.SQAD_CONTACT_PROVIDER;
    } else {
      process.env.SQAD_CONTACT_PROVIDER = previousProvider;
    }

    if (previousToken === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_TOKEN;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_TOKEN = previousToken;
    }

    if (previousBase === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_BASE;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_BASE = previousBase;
    }

    if (previousFrom === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_FROM;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_FROM = previousFrom;
    }

    if (previousFromName === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_FROM_NAME;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_FROM_NAME = previousFromName;
    }

    if (previousTo === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_TO;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_TO = previousTo;
    }
  }
});

test("contact service falls back to SMTP when MailerSend fails", async () => {
  const previousProvider = process.env.SQAD_CONTACT_PROVIDER;
  const previousFallback = process.env.SQAD_CONTACT_PROVIDER_FALLBACK;
  const previousToken = process.env.SQAD_CONTACT_MAILERSEND_TOKEN;
  const previousBase = process.env.SQAD_CONTACT_MAILERSEND_BASE;
  const previousFrom = process.env.SQAD_CONTACT_MAILERSEND_FROM;
  const previousTo = process.env.SQAD_CONTACT_MAILERSEND_TO;
  const previousHost = process.env.SQAD_CONTACT_SMTP_HOST;
  const previousPort = process.env.SQAD_CONTACT_SMTP_PORT;
  const previousSmtpFrom = process.env.SQAD_CONTACT_SMTP_FROM;
  const previousSmtpTo = process.env.SQAD_CONTACT_SMTP_TO;
  const previousUser = process.env.SQAD_CONTACT_SMTP_USER;
  const previousPass = process.env.SQAD_CONTACT_SMTP_PASS;
  const originalFetch = globalThis.fetch;

  process.env.SQAD_CONTACT_PROVIDER = "mailersend";
  process.env.SQAD_CONTACT_PROVIDER_FALLBACK = "smtp";
  process.env.SQAD_CONTACT_MAILERSEND_TOKEN = "ms_test_token";
  process.env.SQAD_CONTACT_MAILERSEND_BASE = "https://api.mailersend.com/v1";
  process.env.SQAD_CONTACT_MAILERSEND_FROM = "notificaciones@sqad.mx";
  process.env.SQAD_CONTACT_MAILERSEND_TO = "ventas@sqad.mx";

  process.env.SQAD_CONTACT_SMTP_HOST = "smtp.sqad.test";
  process.env.SQAD_CONTACT_SMTP_PORT = "587";
  process.env.SQAD_CONTACT_SMTP_FROM = "notificaciones@sqad.mx";
  process.env.SQAD_CONTACT_SMTP_TO = "ventas@sqad.mx";
  process.env.SQAD_CONTACT_SMTP_USER = "smtp-user";
  process.env.SQAD_CONTACT_SMTP_PASS = "smtp-pass";

  let sendMailPayload = null;
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ message: "mailer down" })
    };
  };

  try {
    const contact = new ContactService({
      smtpClientFactory: () => ({
        verify: async () => {},
        sendMail: async (payload) => {
          sendMailPayload = payload;
          return {
            messageId: "smtp-fallback-123",
            accepted: ["ventas@sqad.mx"],
            rejected: []
          };
        }
      })
    });

    const result = await contact.deliver({
      name: "Diego Ramirez",
      email: "cliente@empresa.com",
      store: "Super Cadena",
      message: "Prueba fallback.",
      consent: true
    });

    assert.equal(result.provider, "smtp");
    assert.equal(result.providerResponse.fallbackFrom, "mailersend");
    assert.equal(typeof result.providerResponse.fallbackReason, "string");
    assert.equal(sendMailPayload.replyTo, "cliente@empresa.com");
  } finally {
    globalThis.fetch = originalFetch;

    if (previousProvider === undefined) {
      delete process.env.SQAD_CONTACT_PROVIDER;
    } else {
      process.env.SQAD_CONTACT_PROVIDER = previousProvider;
    }

    if (previousFallback === undefined) {
      delete process.env.SQAD_CONTACT_PROVIDER_FALLBACK;
    } else {
      process.env.SQAD_CONTACT_PROVIDER_FALLBACK = previousFallback;
    }

    if (previousToken === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_TOKEN;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_TOKEN = previousToken;
    }

    if (previousBase === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_BASE;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_BASE = previousBase;
    }

    if (previousFrom === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_FROM;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_FROM = previousFrom;
    }

    if (previousTo === undefined) {
      delete process.env.SQAD_CONTACT_MAILERSEND_TO;
    } else {
      process.env.SQAD_CONTACT_MAILERSEND_TO = previousTo;
    }

    if (previousHost === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_HOST;
    } else {
      process.env.SQAD_CONTACT_SMTP_HOST = previousHost;
    }

    if (previousPort === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_PORT;
    } else {
      process.env.SQAD_CONTACT_SMTP_PORT = previousPort;
    }

    if (previousSmtpFrom === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_FROM;
    } else {
      process.env.SQAD_CONTACT_SMTP_FROM = previousSmtpFrom;
    }

    if (previousSmtpTo === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_TO;
    } else {
      process.env.SQAD_CONTACT_SMTP_TO = previousSmtpTo;
    }

    if (previousUser === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_USER;
    } else {
      process.env.SQAD_CONTACT_SMTP_USER = previousUser;
    }

    if (previousPass === undefined) {
      delete process.env.SQAD_CONTACT_SMTP_PASS;
    } else {
      process.env.SQAD_CONTACT_SMTP_PASS = previousPass;
    }
  }
});
