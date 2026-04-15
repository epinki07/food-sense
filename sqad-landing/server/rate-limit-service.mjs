export class RateLimiter {
  constructor({ windowMs, max, name = "rate-limit" }) {
    this.windowMs = Math.max(Number(windowMs) || 60000, 1000);
    this.max = Math.max(Number(max) || 10, 1);
    this.name = name;
    this.buckets = new Map();

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, Math.max(Math.floor(this.windowMs / 2), 5000));
    this.cleanupTimer.unref();
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    this.buckets.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      const filtered = bucket.filter((ts) => ts > now - this.windowMs);
      if (!filtered.length) {
        this.buckets.delete(key);
        continue;
      }
      this.buckets.set(key, filtered);
    }
  }

  consume(key) {
    const safeKey = String(key || "anonymous");
    const now = Date.now();
    const bucket = this.buckets.get(safeKey) || [];
    const filtered = bucket.filter((ts) => ts > now - this.windowMs);

    if (filtered.length >= this.max) {
      const oldest = filtered[0] || now;
      const retryAfterMs = Math.max(oldest + this.windowMs - now, 0);
      return {
        allowed: false,
        retryAfterMs,
        retryAfterSec: Math.max(Math.ceil(retryAfterMs / 1000), 1),
        remaining: 0,
        limit: this.max,
        windowMs: this.windowMs,
        name: this.name
      };
    }

    filtered.push(now);
    this.buckets.set(safeKey, filtered);

    return {
      allowed: true,
      retryAfterMs: 0,
      retryAfterSec: 0,
      remaining: Math.max(this.max - filtered.length, 0),
      limit: this.max,
      windowMs: this.windowMs,
      name: this.name
    };
  }
}

export const getClientAddress = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) {
    return forwarded;
  }

  const realIp = String(req.headers["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }

  return String(req.socket?.remoteAddress || "unknown");
};
