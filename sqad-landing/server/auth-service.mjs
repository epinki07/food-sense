import crypto from "node:crypto";
import { clearCookie, parseCookies, setCookie } from "./utils.mjs";

const COOKIE_NAME = "sqad_sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_USER = "diegopro";
const DEFAULT_SALT = "sqad-salt-v1";
const DEFAULT_PASSWORD_HASH =
  "a54b009afd54923368011a3655e7fa38dfac0971fac42b7f9cbee9decbcd69cba4da996c2e6a98b2d090736194de417b57ea3745c480dac5748bbb3006c6b024";

export class AuthService {
  constructor() {
    this.user = process.env.SQAD_USER || DEFAULT_USER;
    this.salt = process.env.SQAD_PASSWORD_SALT || DEFAULT_SALT;
    this.hashHex = process.env.SQAD_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;
    this.sessions = new Map();

    const hashBuffer = Buffer.from(this.hashHex, "hex");
    if (!hashBuffer.length) {
      throw new Error("SQAD_PASSWORD_HASH inválido");
    }
    this.hashBuffer = hashBuffer;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }

  hashPassword(password) {
    return crypto.scryptSync(String(password || ""), this.salt, this.hashBuffer.length);
  }

  verifyCredentials(username, password) {
    if (String(username || "").trim() !== this.user) {
      return false;
    }

    const candidate = this.hashPassword(password);
    try {
      return crypto.timingSafeEqual(candidate, this.hashBuffer);
    } catch {
      return false;
    }
  }

  createSession(username) {
    const sid = crypto.randomBytes(24).toString("hex");
    const now = Date.now();
    const session = {
      sid,
      username,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS
    };
    this.sessions.set(sid, session);
    return session;
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sid, session] of this.sessions.entries()) {
      if (!session || session.expiresAt <= now) {
        this.sessions.delete(sid);
      }
    }
  }

  getSessionFromRequest(req) {
    this.cleanupExpiredSessions();
    const cookies = parseCookies(req.headers.cookie || "");
    const sid = cookies[COOKIE_NAME];
    if (!sid) {
      return null;
    }

    const session = this.sessions.get(sid);
    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sid);
      return null;
    }

    return session;
  }

  setSessionCookie(res, session, req) {
    const isSecure = (req.headers["x-forwarded-proto"] || "").includes("https") || false;
    setCookie(res, COOKIE_NAME, session.sid, {
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      sameSite: "Lax",
      httpOnly: true,
      secure: isSecure,
      path: "/"
    });
  }

  clearSessionCookie(res, req) {
    const isSecure = (req.headers["x-forwarded-proto"] || "").includes("https") || false;
    clearCookie(res, COOKIE_NAME, {
      sameSite: "Lax",
      httpOnly: true,
      secure: isSecure,
      path: "/"
    });
  }

  logout(req, res) {
    const session = this.getSessionFromRequest(req);
    if (session) {
      this.sessions.delete(session.sid);
    }
    this.clearSessionCookie(res, req);
  }
}

export const sanitizeSession = (session) => {
  if (!session) {
    return null;
  }

  return {
    username: session.username,
    signedAt: new Date(session.createdAt).toISOString()
  };
};
