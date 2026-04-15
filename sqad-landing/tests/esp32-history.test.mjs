import assert from "node:assert/strict";
import test from "node:test";
import { Esp32HistoryService } from "../server/esp32-history-service.mjs";

test("esp32 history service gets latest data with bounded limit", async () => {
  const calls = [];
  const service = new Esp32HistoryService({
    clientFactory: async () => ({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return [[{ sensor: "sensor_1", temp: 4.2, datetime: "2026-02-28 18:45:00" }], []];
      }
    })
  });

  const rows = await service.getLatestData(9999);
  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /SELECT sensor, temp, CONCAT\(date,' ',time\) AS datetime/);
  assert.equal(calls[0].params[0], 500);
});

test("esp32 history service returns filtered history and stringifies date/time", async () => {
  const calls = [];
  const service = new Esp32HistoryService({
    clientFactory: async () => ({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return [[{
          sensor: "sensor_2",
          temp: 5.1,
          date: new Date("2026-02-28T00:00:00.000Z"),
          time: "08:30:00",
          user: "diego"
        }], []];
      }
    })
  });

  const rows = await service.getHistory({ sensor: "sensor_2", limit: 25 });
  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /WHERE sensor = \?/);
  assert.equal(calls[0].params[0], "sensor_2");
  assert.equal(calls[0].params[1], 25);
  assert.equal(typeof rows[0].date, "string");
  assert.equal(typeof rows[0].time, "string");
});

test("esp32 history service inserts submitted measurements", async () => {
  const calls = [];
  const service = new Esp32HistoryService({
    clientFactory: async () => ({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return [[{ affectedRows: 1 }], []];
      }
    })
  });

  const result = await service.submitMeasurement({
    sensor: "camara_frio_1",
    temp: "3.7",
    datetime: "2026-02-28T18:45:00Z",
    user: "usuario_web"
  });

  assert.equal(result.success, true);
  assert.match(calls[0].sql, /INSERT INTO .*mediciones .*sensor, temp, date, time, user, equip/);
  assert.equal(calls[0].params[0], "camara_frio_1");
  assert.equal(calls[0].params[1], 3.7);
  assert.equal(calls[0].params[2], "2026-02-28");
  assert.equal(calls[0].params[3], "18:45:00");
  assert.equal(calls[0].params[4], "usuario_web");
  assert.equal(calls[0].params[5], "web_interface");
});

test("esp32 history service rejects incomplete submit payload", async () => {
  const service = new Esp32HistoryService({
    clientFactory: async () => ({
      query: async () => [[{ affectedRows: 1 }], []]
    })
  });

  await assert.rejects(
    service.submitMeasurement({
      sensor: "",
      temp: null,
      datetime: "2026-02-28T18:45:00Z"
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});
