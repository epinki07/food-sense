const DEFAULT_CONTACT_TO = "dramirezmagana@gmail.com";
const DEFAULT_CONTACT_FROM = "dramirezmagana@gmail.com";
const DEFAULT_FORMSUBMIT_BASE = "https://formsubmit.co/ajax";
const DEFAULT_MAILERSEND_BASE = "https://api.mailersend.com/v1";

const cleanText = (value, maxLength = 4000) => {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const getEmailDomain = (email) => String(email || "").trim().toLowerCase().split("@").pop() || "";
const PUBLIC_MAILBOX_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "aol.com"
]);

const toBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["true", "1", "yes", "ok", "success", "sent"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "error", "failed", "fail"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const envBoolean = (value, fallback = false) => {
  const parsed = toBoolean(value);
  return parsed === undefined ? fallback : parsed;
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractProviderMessage = (payload, fallback) => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const candidates = [payload.message, payload.error, payload.errors, payload.detail];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return String(candidate[0]);
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
};

const getOriginFromUrl = (value) => {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
};

export class ContactService {
  constructor(options = {}) {
    this.provider = String(process.env.SQAD_CONTACT_PROVIDER || "formsubmit").toLowerCase();
    this.providerFallback = String(process.env.SQAD_CONTACT_PROVIDER_FALLBACK || "").toLowerCase().trim();
    this.contactTo = String(process.env.SQAD_CONTACT_TO || DEFAULT_CONTACT_TO).trim();
    this.fromEmail = String(process.env.SQAD_CONTACT_FROM || DEFAULT_CONTACT_FROM).trim();
    this.formSubmitBase = String(process.env.SQAD_CONTACT_FORMSUBMIT_BASE || DEFAULT_FORMSUBMIT_BASE).trim();
    this.webhookUrl = String(process.env.SQAD_CONTACT_WEBHOOK || "").trim();
    this.subjectPrefix = cleanText(process.env.SQAD_CONTACT_SUBJECT_PREFIX || "Portfolio Contact", 120);
    this.requireCaptcha = process.env.SQAD_CONTACT_CAPTCHA ? process.env.SQAD_CONTACT_CAPTCHA === "1" : false;
    this.smtpHost = cleanText(process.env.SQAD_CONTACT_SMTP_HOST || "", 255);
    this.smtpPort = Number(process.env.SQAD_CONTACT_SMTP_PORT || 587);
    this.smtpSecure = process.env.SQAD_CONTACT_SMTP_SECURE
      ? process.env.SQAD_CONTACT_SMTP_SECURE === "1"
      : this.smtpPort === 465;
    this.smtpRequireTls = envBoolean(process.env.SQAD_CONTACT_SMTP_REQUIRE_TLS, true);
    this.smtpUser = cleanText(process.env.SQAD_CONTACT_SMTP_USER || "", 255);
    this.smtpPass = String(process.env.SQAD_CONTACT_SMTP_PASS || "");
    this.smtpFrom = cleanText(process.env.SQAD_CONTACT_SMTP_FROM || this.fromEmail, 180);
    this.smtpTo = cleanText(process.env.SQAD_CONTACT_SMTP_TO || this.contactTo, 180);
    this.smtpClientFactory = typeof options.smtpClientFactory === "function" ? options.smtpClientFactory : null;
    this.smtpTransport = null;
    this.smtpVerified = false;
    this.mailerSendBase = String(process.env.SQAD_CONTACT_MAILERSEND_BASE || DEFAULT_MAILERSEND_BASE).trim();
    this.mailerSendToken = String(process.env.SQAD_CONTACT_MAILERSEND_TOKEN || "").trim();
    this.mailerSendFrom = cleanText(process.env.SQAD_CONTACT_MAILERSEND_FROM || this.fromEmail, 180);
    this.mailerSendFromName = cleanText(process.env.SQAD_CONTACT_MAILERSEND_FROM_NAME || "Diego Ramírez", 120);
    this.mailerSendTo = cleanText(process.env.SQAD_CONTACT_MAILERSEND_TO || this.contactTo, 180);
  }

  async validateProviderResponse(response, defaultErrorMessage) {
    const rawText = await response.text();
    const parsed = parseJsonSafe(rawText);

    if (!response.ok) {
      const error = new Error(extractProviderMessage(parsed, `${defaultErrorMessage} (${response.status})`));
      error.statusCode = 502;
      throw error;
    }

    if (parsed && typeof parsed === "object") {
      const successCandidate = parsed.success ?? parsed.ok ?? parsed.status;
      const normalizedSuccess = toBoolean(successCandidate);
      if (normalizedSuccess === false) {
        const error = new Error(extractProviderMessage(parsed, "El proveedor rechazó la solicitud de contacto."));
        error.statusCode = 502;
        throw error;
      }
    }

    return parsed;
  }

  normalize(payload) {
    const normalized = {
      name: cleanText(payload?.name, 120),
      email: cleanText(payload?.email, 180),
      store: cleanText(payload?.store, 180),
      message: cleanText(payload?.message, 2000),
      consent: Boolean(payload?.consent),
      source: cleanText(payload?.source || "sqad-landing", 80),
      sourceUrl: cleanText(payload?.sourceUrl || "", 512)
    };
    return normalized;
  }

  validate(payload) {
    if (!payload.name) {
      return { ok: false, error: "Ingrese su nombre." };
    }
    if (!payload.email || !isValidEmail(payload.email)) {
      return { ok: false, error: "Ingrese un correo de contacto válido." };
    }
    if (!payload.store) {
      return { ok: false, error: "Ingrese la cadena o tienda." };
    }
    if (!payload.consent) {
      return { ok: false, error: "Debe aceptar el consentimiento de contacto." };
    }
    return { ok: true };
  }

  buildSubject(payload) {
    const storeLabel = payload.store || "Interested business";
    return `${this.subjectPrefix} - ${storeLabel}`.slice(0, 180);
  }

  buildMessage(payload) {
    return [
      "New contact request from portfolio landing.",
      "",
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      `Store: ${payload.store}`,
      `Message: ${payload.message || "No additional message."}`,
      "",
      `Source: ${payload.source}`,
      `URL: ${payload.sourceUrl || "Not available"}`,
      `Date: ${new Date().toISOString()}`
    ].join("\n");
  }

  resolveSmtpConfig() {
    const smtpPort = Number(this.smtpPort);
    if (!this.smtpHost) {
      const error = new Error("SQAD_CONTACT_SMTP_HOST no configurado.");
      error.statusCode = 500;
      throw error;
    }
    if (!Number.isInteger(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
      const error = new Error("SQAD_CONTACT_SMTP_PORT inválido.");
      error.statusCode = 500;
      throw error;
    }
    if (!this.smtpFrom || !isValidEmail(this.smtpFrom)) {
      const error = new Error("SQAD_CONTACT_SMTP_FROM inválido.");
      error.statusCode = 500;
      throw error;
    }
    if (!this.smtpTo || !isValidEmail(this.smtpTo)) {
      const error = new Error("SQAD_CONTACT_SMTP_TO inválido.");
      error.statusCode = 500;
      throw error;
    }
    if ((this.smtpUser && !this.smtpPass) || (!this.smtpUser && this.smtpPass)) {
      const error = new Error("Defina SQAD_CONTACT_SMTP_USER y SQAD_CONTACT_SMTP_PASS juntos.");
      error.statusCode = 500;
      throw error;
    }

    const config = {
      host: this.smtpHost,
      port: smtpPort,
      secure: this.smtpSecure,
      requireTLS: this.smtpRequireTls
    };
    if (this.smtpUser && this.smtpPass) {
      config.auth = {
        user: this.smtpUser,
        pass: this.smtpPass
      };
    }

    return config;
  }

  async getSmtpTransport(config) {
    if (this.smtpTransport) {
      return this.smtpTransport;
    }

    if (this.smtpClientFactory) {
      this.smtpTransport = this.smtpClientFactory(config);
      return this.smtpTransport;
    }

    let nodemailer;
    try {
      const imported = await import("nodemailer");
      nodemailer = imported.default || imported;
    } catch {
      const error = new Error("Proveedor SMTP requiere instalar la dependencia nodemailer.");
      error.statusCode = 500;
      throw error;
    }

    if (!nodemailer || typeof nodemailer.createTransport !== "function") {
      const error = new Error("No fue posible inicializar nodemailer.");
      error.statusCode = 500;
      throw error;
    }

    this.smtpTransport = nodemailer.createTransport(config);
    return this.smtpTransport;
  }

  async verifySmtpTransport(transport) {
    if (this.smtpVerified) {
      return;
    }
    if (!transport || typeof transport.verify !== "function") {
      this.smtpVerified = true;
      return;
    }
    try {
      await transport.verify();
      this.smtpVerified = true;
    } catch (error) {
      const wrapped = new Error(`SMTP no disponible: ${error?.message || "error de conexión"}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }
  }

  async deliverToWebhook(payload) {
    if (!this.webhookUrl) {
      throw new Error("SQAD_CONTACT_WEBHOOK no configurado.");
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        subject: this.buildSubject(payload),
        message: this.buildMessage(payload),
        ...payload
      })
    });

    const parsed = await this.validateProviderResponse(response, "Webhook de contacto no disponible");

    return { provider: "webhook", providerResponse: parsed };
  }

  async deliverToFormSubmit(payload) {
    const destinationEmail = cleanText(this.contactTo, 180);
    if (!destinationEmail || !isValidEmail(destinationEmail)) {
      const error = new Error("SQAD_CONTACT_TO inválido.");
      error.statusCode = 500;
      throw error;
    }
    const senderEmail = cleanText(this.fromEmail, 180);
    if (!senderEmail || !isValidEmail(senderEmail)) {
      const error = new Error("SQAD_CONTACT_FROM inválido.");
      error.statusCode = 500;
      throw error;
    }

    const endpoint = `${this.formSubmitBase}/${encodeURIComponent(destinationEmail)}`;
    const formData = new FormData();
    formData.append("name", payload.name);
    formData.append("email", senderEmail);
    formData.append("_replyto", payload.email);
    formData.append("contact_email", payload.email);
    formData.append("destination_email", destinationEmail);
    formData.append("store", payload.store);
    formData.append("message", payload.message || "");
    formData.append("_subject", this.buildSubject(payload));
    formData.append("_template", "table");
    formData.append("_captcha", this.requireCaptcha ? "true" : "false");
    formData.append("_honey", "");
    formData.append("_source", payload.source);

    const sourceOrigin = getOriginFromUrl(payload.sourceUrl);
    const headers = {
      Accept: "application/json"
    };
    if (sourceOrigin) {
      headers.Origin = sourceOrigin;
      headers.Referer = payload.sourceUrl;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      headers
    });

    const parsed = await this.validateProviderResponse(response, "Servicio de correo no disponible");

    return { provider: "formsubmit", providerResponse: parsed };
  }

  async deliverToSmtp(payload) {
    const config = this.resolveSmtpConfig();
    const transport = await this.getSmtpTransport(config);
    await this.verifySmtpTransport(transport);

    let info;
    try {
      info = await transport.sendMail({
        from: this.smtpFrom,
        to: this.smtpTo,
        replyTo: payload.email,
        subject: this.buildSubject(payload),
        text: this.buildMessage(payload)
      });
    } catch (error) {
      const wrapped = new Error(`No fue posible enviar por SMTP: ${error?.message || "error"}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }

    const acceptedCount = Array.isArray(info?.accepted) ? info.accepted.length : 0;
    const rejectedCount = Array.isArray(info?.rejected) ? info.rejected.length : 0;
    if (!acceptedCount && rejectedCount > 0) {
      const error = new Error("El servidor SMTP rechazó el mensaje.");
      error.statusCode = 502;
      throw error;
    }

    return {
      provider: "smtp",
      providerResponse: {
        messageId: String(info?.messageId || ""),
        accepted: acceptedCount,
        rejected: rejectedCount
      }
    };
  }

  async deliverToMailerSend(payload) {
    if (!this.mailerSendToken) {
      const error = new Error("SQAD_CONTACT_MAILERSEND_TOKEN no configurado.");
      error.statusCode = 500;
      throw error;
    }
    if (!this.mailerSendFrom || !isValidEmail(this.mailerSendFrom)) {
      const error = new Error("SQAD_CONTACT_MAILERSEND_FROM inválido.");
      error.statusCode = 500;
      throw error;
    }
    const senderDomain = getEmailDomain(this.mailerSendFrom);
    if (PUBLIC_MAILBOX_DOMAINS.has(senderDomain)) {
      const error = new Error(
        "MailerSend requiere un remitente de dominio propio verificado (no Gmail/Outlook/Yahoo)."
      );
      error.statusCode = 500;
      throw error;
    }
    if (!this.mailerSendTo || !isValidEmail(this.mailerSendTo)) {
      const error = new Error("SQAD_CONTACT_MAILERSEND_TO inválido.");
      error.statusCode = 500;
      throw error;
    }
    if (!this.mailerSendBase || !/^https?:\/\//i.test(this.mailerSendBase)) {
      const error = new Error("SQAD_CONTACT_MAILERSEND_BASE inválido.");
      error.statusCode = 500;
      throw error;
    }

    const endpoint = `${this.mailerSendBase.replace(/\/+$/, "")}/email`;
    const requestBody = {
      from: {
        email: this.mailerSendFrom,
        name: this.mailerSendFromName || "Food Sense"
      },
      to: [
        {
          email: this.mailerSendTo
        }
      ],
      reply_to: {
        email: payload.email,
        name: payload.name
      },
      subject: this.buildSubject(payload),
      text: this.buildMessage(payload)
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.mailerSendToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const parsed = await this.validateProviderResponse(response, "MailerSend API no disponible");
    const messageIdHeader =
      response?.headers && typeof response.headers.get === "function"
        ? String(response.headers.get("x-message-id") || "")
        : "";

    const providerResponse =
      parsed && typeof parsed === "object"
        ? { ...parsed }
        : {};

    if (messageIdHeader) {
      providerResponse.messageId = messageIdHeader;
    }

    return {
      provider: "mailersend",
      providerResponse
    };
  }

  async deliverWithProvider(provider, payload) {
    if (provider === "smtp") {
      return this.deliverToSmtp(payload);
    }

    if (provider === "webhook") {
      return this.deliverToWebhook(payload);
    }

    if (provider === "mailersend") {
      return this.deliverToMailerSend(payload);
    }

    if (provider === "formsubmit") {
      return this.deliverToFormSubmit(payload);
    }

    const error = new Error("SQAD_CONTACT_PROVIDER inválido. Use mailersend, smtp, formsubmit o webhook.");
    error.statusCode = 500;
    throw error;
  }

  async deliver(rawPayload) {
    const payload = this.normalize(rawPayload);
    const validation = this.validate(payload);
    if (!validation.ok) {
      const error = new Error(validation.error);
      error.statusCode = 400;
      throw error;
    }

    const primaryProvider = String(this.provider || "formsubmit").toLowerCase();

    try {
      return await this.deliverWithProvider(primaryProvider, payload);
    } catch (primaryError) {
      const fallbackProvider = String(this.providerFallback || "").toLowerCase();
      if (!fallbackProvider || fallbackProvider === primaryProvider) {
        throw primaryError;
      }

      try {
        const fallbackResult = await this.deliverWithProvider(fallbackProvider, payload);
        const safeProviderResponse =
          fallbackResult.providerResponse && typeof fallbackResult.providerResponse === "object"
            ? { ...fallbackResult.providerResponse }
            : {};

        safeProviderResponse.fallbackFrom = primaryProvider;
        safeProviderResponse.fallbackReason = String(primaryError?.message || "primary provider error");

        return {
          provider: fallbackResult.provider,
          providerResponse: safeProviderResponse
        };
      } catch (fallbackError) {
        const wrapped = new Error(
          `Fallo proveedor principal (${primaryProvider}): ${primaryError?.message || "error"}. ` +
          `Fallo fallback (${fallbackProvider}): ${fallbackError?.message || "error"}`
        );
        wrapped.statusCode = fallbackError?.statusCode || primaryError?.statusCode || 502;
        throw wrapped;
      }
    }
  }
}
