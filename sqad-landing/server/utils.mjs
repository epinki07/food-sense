import { StringDecoder } from "node:string_decoder";

export const json = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
};

export const noContent = (res, statusCode = 204) => {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store"
  });
  res.end();
};

export const readJsonBody = async (req, maxBytes = 24 * 1024) => {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload demasiado grande"));
        req.destroy();
        return;
      }
      body += decoder.write(chunk);
    });

    req.on("end", () => {
      body += decoder.end();
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });

    req.on("error", reject);
  });
};

export const parseCookies = (cookieHeader = "") => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((bag, part) => {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) {
      return bag;
    }
    const value = valueParts.join("=");
    try {
      bag[name] = decodeURIComponent(value || "");
    } catch {
      bag[name] = value || "";
    }
    return bag;
  }, {});
};

export const setCookie = (res, name, value, options = {}) => {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    pieces.push(`Max-Age=${Math.max(Number(options.maxAge) || 0, 0)}`);
  }
  if (options.httpOnly !== false) {
    pieces.push("HttpOnly");
  }
  if (options.sameSite) {
    pieces.push(`SameSite=${options.sameSite}`);
  } else {
    pieces.push("SameSite=Lax");
  }
  pieces.push(`Path=${options.path || "/"}`);
  if (options.secure) {
    pieces.push("Secure");
  }

  const previous = res.getHeader("Set-Cookie");
  const all = Array.isArray(previous) ? previous : previous ? [previous] : [];
  all.push(pieces.join("; "));
  res.setHeader("Set-Cookie", all);
};

export const clearCookie = (res, name, options = {}) => {
  setCookie(res, name, "", {
    ...options,
    maxAge: 0
  });
};

export const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

export const withSecurityHeaders = (headers = {}) => {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...headers
  };
};
