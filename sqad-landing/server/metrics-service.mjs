import fs from "node:fs";
import path from "node:path";

export class MetricsService {
  constructor(baseDir) {
    this.records = [];
    this.maxRecords = 5000;
    this.logPath = path.join(baseDir, "logs", "metrics.ndjson");
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
  }

  record(metric) {
    const payload = {
      name: String(metric?.name || "unknown"),
      value: Number(metric?.value || 0),
      detail: metric?.detail && typeof metric.detail === "object" ? metric.detail : {},
      path: String(metric?.path || ""),
      ts: Number(metric?.ts || Date.now()),
      ua: String(metric?.ua || "")
    };

    if (!Number.isFinite(payload.value)) {
      payload.value = 0;
    }

    this.records.push(payload);
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }

    fs.appendFile(this.logPath, `${JSON.stringify(payload)}\n`, () => {
      // no-op best effort logging
    });

    return payload;
  }

  summary() {
    const byName = new Map();
    this.records.forEach((record) => {
      if (!byName.has(record.name)) {
        byName.set(record.name, []);
      }
      byName.get(record.name).push(record.value);
    });

    const metrics = Array.from(byName.entries()).map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const total = sorted.reduce((sum, item) => sum + item, 0);
      const avg = sorted.length ? total / sorted.length : 0;
      const p95Index = Math.max(Math.ceil(sorted.length * 0.95) - 1, 0);
      const p95 = sorted.length ? sorted[p95Index] : 0;
      const max = sorted.length ? sorted[sorted.length - 1] : 0;
      return {
        name,
        count: sorted.length,
        avg: Math.round(avg * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        max: Math.round(max * 100) / 100
      };
    });

    return {
      count: this.records.length,
      metrics
    };
  }
}
