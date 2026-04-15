import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

test("build generates production artifacts", () => {
  execFileSync("node", ["tools/build.mjs"], { cwd: root, stdio: "pipe" });

  const requiredFiles = [
    "index.html",
    "styles.min.css",
    "script.min.js",
    "index.html.br",
    "styles.min.css.br",
    "script.min.js.br",
    "index.html.gz",
    "styles.min.css.gz",
    "script.min.js.gz"
  ];

  requiredFiles.forEach((file) => {
    assert.ok(fs.existsSync(path.join(dist, file)), `Missing ${file}`);
  });

  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  assert.match(html, /styles\.min\.css/);
  assert.match(html, /script\.min\.js/);
});
