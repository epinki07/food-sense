import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("personal landing sections and contact form exist", () => {
  assert.match(html, /id="inicio"/);
  assert.match(html, /id="proyectos"/);
  assert.match(html, /id="skills"/);
  assert.match(html, /id="sobre-mi"/);
  assert.match(html, /id="contacto"/);
  assert.match(html, /id="featured-projects"/);
  assert.match(html, /id="contact-form"/);
});

test("header and showcase layout rules are present", () => {
  assert.match(css, /\.site-header \.header-shell\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.project-grid\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.hero-summary\s*\{[\s\S]*grid-template-columns:/);
});

test("performance hardening rules are present", () => {
  assert.match(css, /content-visibility:\s*auto/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});
