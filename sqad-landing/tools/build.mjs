import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const write = (relativePath, content) => {
  const fullPath = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
};

const resetDist = () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
};

const copyRecursive = (sourcePath, targetPath) => {
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    fs.readdirSync(sourcePath).forEach((entry) => {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    });
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
};

const minifyCss = (css) => {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
};

const minifyHtml = (html) => {
  return html
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const lightMinifyJs = (js) => {
  return js
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const writeCompressed = (relativePath, contentBuffer) => {
  const filePath = path.join(DIST, relativePath);
  const gz = zlib.gzipSync(contentBuffer, { level: 9 });
  const br = zlib.brotliCompressSync(contentBuffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11
    }
  });
  fs.writeFileSync(`${filePath}.gz`, gz);
  fs.writeFileSync(`${filePath}.br`, br);
};

const main = () => {
  resetDist();

  const legacyCss = read("styles.css");
  const baseCss = read("src/styles/base.css");
  const a11yCss = read("src/styles/accessibility.css");
  const perfCss = read("src/styles/performance.css");

  const bundledCss = `${legacyCss}\n${baseCss}\n${a11yCss}\n${perfCss}`;
  const cssMin = minifyCss(bundledCss);
  write("styles.min.css", cssMin);

  const scriptRaw = read("script.js");
  const scriptMin = lightMinifyJs(scriptRaw);
  write("script.min.js", scriptMin);

  let indexHtml = read("index.html");
  indexHtml = indexHtml
    .replace(/<link rel="stylesheet" href="styles\.css"\s*\/>/, '<link rel="stylesheet" href="styles.min.css" />')
    .replace(/<link rel="stylesheet" href="src\/styles\/base\.css"\s*\/>\s*/g, "")
    .replace(/<link rel="stylesheet" href="src\/styles\/accessibility\.css"\s*\/>\s*/g, "")
    .replace(/<link rel="stylesheet" href="src\/styles\/performance\.css"\s*\/>\s*/g, "")
    .replace(/<script src="script\.js(?:\?[^"]*)?"><\/script>/, '<script src="script.min.js?v=20260301-food-sense"></script>');

  const htmlMin = minifyHtml(indexHtml);
  write("index.html", htmlMin);

  copyRecursive(path.join(ROOT, "assets"), path.join(DIST, "assets"));

  writeCompressed("index.html", Buffer.from(htmlMin));
  writeCompressed("styles.min.css", Buffer.from(cssMin));
  writeCompressed("script.min.js", Buffer.from(scriptMin));

  console.log("Build completado en dist/");
};

main();
