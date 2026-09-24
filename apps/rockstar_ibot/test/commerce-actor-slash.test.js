"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const serverDependenciesAvailable = [
  "ws", "inngest/node", "inngest", "stripe", "canonicalize", "tldts", "@noble/hashes/sha3.js",
].every((dependency) => {
  try {
    require.resolve(dependency, { paths: [path.join(__dirname, "..")] });
    return true;
  } catch {
    return false;
  }
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("POST /telegram passes the real actor and denies group /pause before commerce writes", {
  concurrency: false,
  skip: serverDependenciesAvailable ? false : "rockstar_ibot server dependencies are not installed",
}, async () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    LM_TELEGRAM_BOT_TOKEN: "fixture-token",
    LM_TELEGRAM_WEBHOOK_SECRET: "fixture-secret",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-role",
    LIFE_RUN_LOOPS: "false",
    LM_PUBLIC_URL: "https://lm.test",
  });
  const originalCreateServer = http.createServer;
  const originalFetch = global.fetch;
  let productionServer;
  let commerceWrites = 0;
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
    if (url.pathname === "/rest/v1/lm_users" && method === "GET") {
      const chatId = String(url.searchParams.get("telegram_chat_id") || "").replace(/^eq\./, "");
      return response(200, [{ uid: `uid-${chatId}`, telegram_chat_id: chatId, paid: true }]);
    }
    if (url.pathname === "/rest/v1/lm_commerce_objects" && method === "GET") {
      return response(200, []);
    }
    if (url.pathname === "/rest/v1/lm_commerce_objects" && method === "POST") {
      commerceWrites += 1;
      const body = JSON.parse(init.body);
      return response(201, [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ...body }]);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const serverPath = require.resolve("../server.js");
    delete require.cache[serverPath];
    require(serverPath);
    await new Promise((resolve) => productionServer.listen(0, "127.0.0.1", resolve));
    const post = (chatId, actorId) => new Promise((resolve, reject) => {
      const body = JSON.stringify({
        update_id: Number(actorId) + 100,
        message: {
          message_id: Number(actorId) + 200,
          date: Math.floor(Date.now() / 1000),
          from: { id: Number(actorId), first_name: "Fixture" },
          chat: { id: Number(chatId) },
          text: "/pause",
        },
      });
      const request = http.request({
        hostname: "127.0.0.1",
        port: productionServer.address().port,
        path: "/telegram",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-telegram-bot-api-secret-token": "fixture-secret",
        },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      request.on("error", reject);
      request.end(body);
    });

    assert.equal(await post("-100", "42"), 200);
    assert.equal(commerceWrites, 0);
    assert.match(sent.at(-1).text, /所有者.*個人チャット/);

    assert.equal(await post("42", "42"), 200);
    assert.equal(commerceWrites, 1);
    assert.match(sent.at(-1).text, /Commerceを停止/);
  } finally {
    if (productionServer) await new Promise((resolve) => productionServer.close(resolve));
    http.createServer = originalCreateServer;
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(env, key)) delete process.env[key];
    }
    Object.assign(process.env, env);
  }
});
