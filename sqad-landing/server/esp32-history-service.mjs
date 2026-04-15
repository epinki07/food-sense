const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_USER = "esp32";
const DEFAULT_DB_PASSWORD = "esp32pass";
const DEFAULT_DB_NAME = "sistema_refrigeradores";
const DEFAULT_DB_PORT = 3307;
const DEFAULT_TABLE_NAME = "mediciones";
const DEFAULT_EQUIP = "web_interface";

const cleanText = (value, maxLength = 255) => {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const safeInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
};

const normalizeTableName = (value) => {
  const table = cleanText(value || DEFAULT_TABLE_NAME, 80);
  return /^[A-Za-z0-9_]+$/.test(table) ? table : DEFAULT_TABLE_NAME;
};

const parseIsoDateTime = (rawValue) => {
  const source = String(rawValue || "").trim();
  if (!source) {
    const error = new Error("Campo datetime requerido.");
    error.statusCode = 400;
    throw error;
  }

  const normalized = source.replace(" ", "T");
  const match = normalized.match(
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?$/
  );
  if (!match) {
    const error = new Error("Formato datetime inválido.");
    error.statusCode = 400;
    throw error;
  }

  const date = match[1];
  const hour = match[2] || "00";
  const minute = match[3] || "00";
  const second = match[4] || "00";
  const validator = new Date(`${date}T${hour}:${minute}:${second}Z`);
  if (!Number.isFinite(validator.getTime())) {
    const error = new Error("Formato datetime inválido.");
    error.statusCode = 400;
    throw error;
  }

  return { date, time: `${hour}:${minute}:${second}` };
};

const normalizeHistoryRows = (rows) => {
  return rows.map((row) => {
    const normalized = { ...row };
    if (normalized.date !== undefined && normalized.date !== null) {
      normalized.date = String(normalized.date);
    }
    if (normalized.time !== undefined && normalized.time !== null) {
      normalized.time = String(normalized.time);
    }
    return normalized;
  });
};

export class Esp32HistoryService {
  constructor(options = {}) {
    this.host = cleanText(options.host || process.env.SQAD_ESP32_DB_HOST || DEFAULT_DB_HOST, 120);
    this.user = cleanText(options.user || process.env.SQAD_ESP32_DB_USER || DEFAULT_DB_USER, 120);
    this.password = String(options.password || process.env.SQAD_ESP32_DB_PASSWORD || DEFAULT_DB_PASSWORD);
    this.database = cleanText(options.database || process.env.SQAD_ESP32_DB_NAME || DEFAULT_DB_NAME, 120);
    this.port = safeInteger(options.port || process.env.SQAD_ESP32_DB_PORT, DEFAULT_DB_PORT, 1, 65535);
    this.tableName = normalizeTableName(options.tableName || process.env.SQAD_ESP32_DB_TABLE || DEFAULT_TABLE_NAME);
    this.defaultUser = cleanText(options.defaultUser || process.env.SQAD_ESP32_DEFAULT_USER || "usuario_web", 120);
    this.defaultEquip = cleanText(options.defaultEquip || process.env.SQAD_ESP32_DEFAULT_EQUIP || DEFAULT_EQUIP, 120);
    this.clientFactory = typeof options.clientFactory === "function" ? options.clientFactory : null;
    this.client = null;
  }

  async dispose() {
    if (this.client && typeof this.client.end === "function") {
      await this.client.end();
    }
    this.client = null;
  }

  async resolveClient() {
    if (this.client) {
      return this.client;
    }

    if (this.clientFactory) {
      const customClient = await this.clientFactory();
      if (!customClient || typeof customClient.query !== "function") {
        const error = new Error("Cliente SQL inválido para ESP32.");
        error.statusCode = 500;
        throw error;
      }
      this.client = customClient;
      return this.client;
    }

    let mysql;
    try {
      const imported = await import("mysql2/promise");
      mysql = imported.default || imported;
    } catch {
      const error = new Error("Para usar historial ESP32, instala la dependencia mysql2.");
      error.statusCode = 500;
      throw error;
    }

    if (!mysql || typeof mysql.createPool !== "function") {
      const error = new Error("No fue posible inicializar mysql2.");
      error.statusCode = 500;
      throw error;
    }

    this.client = mysql.createPool({
      host: this.host,
      user: this.user,
      password: this.password,
      database: this.database,
      port: this.port,
      connectionLimit: 6,
      waitForConnections: true
    });

    return this.client;
  }

  async runQuery(sql, params = []) {
    const client = await this.resolveClient();
    try {
      const result = await client.query(sql, params);
      if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
      }
      if (Array.isArray(result)) {
        return result;
      }
      if (result && Array.isArray(result.rows)) {
        return result.rows;
      }
      return [];
    } catch (error) {
      const wrapped = new Error(`Error en base de datos ESP32: ${error?.message || "query fallida"}`);
      wrapped.statusCode = 500;
      throw wrapped;
    }
  }

  async getLatestData(limit = 50) {
    const safeLimit = safeInteger(limit, 50, 1, 500);
    const rows = await this.runQuery(
      `SELECT sensor, temp, CONCAT(date,' ',time) AS datetime FROM ${this.tableName} ORDER BY id DESC LIMIT ?`,
      [safeLimit]
    );
    return Array.isArray(rows) ? rows : [];
  }

  async getHistory({ sensor = "", limit = 10 } = {}) {
    const safeLimit = safeInteger(limit, 10, 1, 500);
    const safeSensor = cleanText(sensor, 120);

    let rows;
    if (safeSensor) {
      rows = await this.runQuery(
        `SELECT sensor, temp, date, time, user FROM ${this.tableName} WHERE sensor = ? ORDER BY id DESC LIMIT ?`,
        [safeSensor, safeLimit]
      );
    } else {
      rows = await this.runQuery(
        `SELECT sensor, temp, date, time, user FROM ${this.tableName} ORDER BY id DESC LIMIT ?`,
        [safeLimit]
      );
    }

    return normalizeHistoryRows(Array.isArray(rows) ? rows : []);
  }

  async submitMeasurement(payload) {
    const sensor = cleanText(payload?.sensor, 120);
    const temp = Number(payload?.temp);
    const datetimeInput = cleanText(payload?.datetime, 80);
    const user = cleanText(payload?.user || this.defaultUser, 120) || this.defaultUser;

    if (!sensor || !Number.isFinite(temp)) {
      const error = new Error("Datos incompletos");
      error.statusCode = 400;
      throw error;
    }

    const { date, time } = parseIsoDateTime(datetimeInput);

    await this.runQuery(
      `INSERT INTO ${this.tableName} (sensor, temp, date, time, user, equip) VALUES (?, ?, ?, ?, ?, ?)`,
      [sensor, temp, date, time, user, this.defaultEquip]
    );

    return {
      success: true,
      message: `Temperatura ${temp}°C del ${sensor} registrada correctamente`
    };
  }
}
