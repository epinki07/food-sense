import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { withSecurityHeaders } from "./utils.mjs";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const TEXT_TYPES = ["text/", "application/javascript", "application/json", "image/svg+xml"];

const canCompress = (contentType) => {
  if (!contentType) {
    return false;
  }
  return TEXT_TYPES.some((entry) => contentType.startsWith(entry));
};

export class StaticService {
  constructor(staticRoot) {
    this.staticRoot = staticRoot;
    this.compressCache = new Map();
  }

  contentTypeFor(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return MIME_TYPES[extension] || "application/octet-stream";
  }

  resolvePath(requestPath) {
    let safePath;
    try {
      safePath = decodeURIComponent(requestPath.split("?")[0]);
    } catch {
      return null;
    }
    const basePath = safePath === "/" ? "/index.html" : safePath;
    const rootPath = path.resolve(this.staticRoot);
    const absolutePath = path.resolve(path.join(rootPath, `.${basePath}`));
    const isInsideRoot = absolutePath === rootPath || absolutePath.startsWith(`${rootPath}${path.sep}`);
    if (!isInsideRoot) {
      return null;
    }
    return absolutePath;
  }

  tryReadPrecompressed(filePath, acceptEncoding) {
    if (acceptEncoding.includes("br") && fs.existsSync(`${filePath}.br`)) {
      return { filePath: `${filePath}.br`, encoding: "br" };
    }
    if (acceptEncoding.includes("gzip") && fs.existsSync(`${filePath}.gz`)) {
      return { filePath: `${filePath}.gz`, encoding: "gzip" };
    }
    return null;
  }

  compressBuffer(buffer, encoding) {
    const key = `${encoding}:${buffer.length}:${buffer.toString("base64", 0, Math.min(buffer.length, 24))}`;
    if (this.compressCache.has(key)) {
      return this.compressCache.get(key);
    }

    let compressed;
    if (encoding === "br") {
      compressed = zlib.brotliCompressSync(buffer);
    } else {
      compressed = zlib.gzipSync(buffer);
    }

    this.compressCache.set(key, compressed);
    if (this.compressCache.size > 200) {
      const firstKey = this.compressCache.keys().next().value;
      this.compressCache.delete(firstKey);
    }

    return compressed;
  }

  serve(req, res, requestPath) {
    const filePath = this.resolvePath(requestPath);
    if (!filePath) {
      res.writeHead(403, withSecurityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, withSecurityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end("Not found");
      return;
    }

    const contentType = this.contentTypeFor(filePath);
    const acceptEncoding = String(req.headers["accept-encoding"] || "").toLowerCase();

    const precompressed = this.tryReadPrecompressed(filePath, acceptEncoding);
    if (precompressed) {
      const payload = fs.readFileSync(precompressed.filePath);
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": contentType,
        "Content-Encoding": precompressed.encoding,
        "Cache-Control": contentType.includes("text/html") ? "no-store" : "public, max-age=3600",
        Vary: "Accept-Encoding"
      }));
      res.end(payload);
      return;
    }

    const payload = fs.readFileSync(filePath);
    if (canCompress(contentType) && payload.length > 1024) {
      if (acceptEncoding.includes("br")) {
        const compressed = this.compressBuffer(payload, "br");
        res.writeHead(200, withSecurityHeaders({
          "Content-Type": contentType,
          "Content-Encoding": "br",
          "Cache-Control": contentType.includes("text/html") ? "no-store" : "public, max-age=3600",
          Vary: "Accept-Encoding"
        }));
        res.end(compressed);
        return;
      }
      if (acceptEncoding.includes("gzip")) {
        const compressed = this.compressBuffer(payload, "gzip");
        res.writeHead(200, withSecurityHeaders({
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
          "Cache-Control": contentType.includes("text/html") ? "no-store" : "public, max-age=3600",
          Vary: "Accept-Encoding"
        }));
        res.end(compressed);
        return;
      }
    }

    res.writeHead(200, withSecurityHeaders({
      "Content-Type": contentType,
      "Cache-Control": contentType.includes("text/html") ? "no-store" : "public, max-age=3600"
    }));
    res.end(payload);
  }
}
