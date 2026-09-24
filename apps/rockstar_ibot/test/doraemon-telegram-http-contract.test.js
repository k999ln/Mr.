"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("POST /telegram welcomes a user and applies one-to-three website selections", {
  concurrency: false,
}, async () => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    LM_TELEGRAM_BOT_TOKEN: "fixture-token",
    LM_TELEGRAM_WEBHOOK_SECRET: "fixture-webhook-secret",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
    LIFE_RUN_LOOPS: "false",
    LM_PUBLIC_URL: "https://lm.test",
  });

  const originalCreateServer = http.createServer;
  const originalFetch = global.fetch;
  let productionServer;
  const sent = [];
  http.createServer = (handler) => {
    productionServer = originalCreateServer(handler);
    return productionServer;
  };
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname === "api.telegram.org" && url.pathname.endsWith("/sendMessage")) {
      sent.push(JSON.parse(init.body));
      return response(200, { ok: true, result: { message_id: sent.length } });
    }
    if (url.pathname.endsWith("/lm_start_doraemon_free_tier") && method === "POST") {
      return response(200, { status: "started", uid: "lm_tg_fixture", paid: false });
    }
    if (url.pathname.endsWith("/lm_replace_doraemon_feature_selections") && method === "POST") {
      const body = JSON.parse(init.body);
      return response(200, { selected_count: body.p_feature_keys.length });
    }
    if (url.pathname.endsWith("/lm_users") && method === "GET") return response(200, []);
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const serverPath = require.resolve("../server.js");
    delete require.cache[serverPath];
    require(serverPath);
    await new Promise((resolve) => productionServer.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${productionServer.address().port}`;
    let updateId = 3100;
    const postMessage = (text) => new Promise((resolve, reject) => {
      const body = JSON.stringify({
        update_id: ++updateId,
        message: {
          message_id: updateId + 100,
          date: Math.floor(Date.now() / 1000),
          from: { id: 123456, first_name: "Fixture" },
          chat: { id: 123456, type: "private" },
          text,
        },
      });
      const request = http.request(`${origin}/telegram`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-telegram-bot-api-secret-token": "fixture-webhook-secret",
        },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      request.on("error", reject);
      request.end(body);
    });

    assert.equal(await postMessage("/start"), 200);
    assert.match(sent.at(-1).text, /ようこそ、avocadominiへ/);
    assert.equal(sent.at(-1).reply_markup.inline_keyboard[0][0].callback_data, "dora:jobs");
    assert.doesNotMatch(sent.at(-1).text, /利用条件|プライバシー/);

    assert.equal(await postMessage("/start f2_7"), 200);
    assert.match(sent.at(-1).text, /総合司令室/);
    assert.match(sent.at(-1).text, /サイトで選んだ内容を反映しました/);
    for (const label of ["依頼を整理", "教材を作る", "内容を検証"]) {
      assert.match(sent.at(-1).text, new RegExp(label));
    }

    assert.equal(await postMessage("/start f2_1"), 200);
    assert.match(sent.at(-1).text, /総合司令室/);
    assert.match(sent.at(-1).text, /依頼を整理/);
  } finally {
    if (productionServer) await new Promise((resolve) => productionServer.close(resolve));
    http.createServer = originalCreateServer;
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(previousEnv, key)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  }
});
