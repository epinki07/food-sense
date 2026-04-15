import crypto from "node:crypto";

const DEFAULT_ALLOWED_HOSTS = ["images.unsplash.com"];

export class ImageCacheService {
  constructor() {
    this.allowedHosts = new Set(DEFAULT_ALLOWED_HOSTS);
    this.cache = new Map();
    this.maxEntries = 220;
    this.ttlMs = 24 * 60 * 60 * 1000;
  }

  normalizeUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("URL de imagen inválida");
    }

    if (!parsed.protocol.startsWith("http")) {
      throw new Error("Protocolo no permitido para imagen");
    }

    if (!this.allowedHosts.has(parsed.hostname)) {
      throw new Error("Host de imagen no permitido");
    }

    return parsed.toString();
  }

  evictIfNeeded() {
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
  }

  async getImage(rawUrl) {
    const normalized = this.normalizeUrl(rawUrl);
    const now = Date.now();
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > now) {
      return cached;
    }

    const response = await fetch(normalized, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`No se pudo recuperar imagen (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const etag = crypto.createHash("sha1").update(buffer).digest("hex");

    const payload = {
      buffer,
      contentType,
      etag,
      expiresAt: now + this.ttlMs
    };

    this.cache.set(normalized, payload);
    this.evictIfNeeded();
    return payload;
  }
}
