"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const JOB_ID = "00000000-0000-4000-8000-000000000001";

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("website selection, room ForceReply, durable job, today, and start restore share one HTTP path", {
  concurrency: false,
}, async () => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    LM_TELEGRAM_BOT_TOKEN: "fixture-token",
    LM_TELEGRAM_WEBHOOK_SECRET: "fixture-webhook-secret",
    LM_CODEX_BRIDGE_ENABLED: "1",
    LM_CODEX_BRIDGE_TOKEN: "fixture-bridge-secret",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
    LIFE_RUN_LOOPS: "false",
    LM_PUBLIC_URL: "https://lm.test",
  });

  const originalCreateServer = http.createServer;
  const originalFetch = global.fetch;
  let productionServer;
  let linked = false;
  let selected = [];
  let enqueued = null;
  const telegram = [];
  const jobs = [];

  http.createServer = (handler) => {
    productionServer = originalCreateServer(handler);
    return productionServer;
  };
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname === "api.telegram.org") {
      const apiMethod = url.pathname.split("/").at(-1);
      const body = JSON.parse(init.body || "{}");
      telegram.push({ method: apiMethod, body });
      return response(200, { ok: true, result: { message_id: 700 + telegram.length } });
    }
    if (url.pathname.endsWith("/lm_start_doraemon_free_tier") && method === "POST") {
      linked = true;
      return response(200, { status: "started", uid: "lm_tg_123456", paid: false });
    }
    if (url.pathname.endsWith("/lm_replace_doraemon_feature_selections") && method === "POST") {
      selected = JSON.parse(init.body).p_feature_keys;
      return response(200, { selected_count: selected.length });
    }
    if (url.pathname.endsWith("/lm_users") && method === "GET") {
      return response(200, linked ? [{ uid: "lm_tg_123456", telegram_chat_id: "123456" }] : []);
    }
    if (url.pathname.endsWith("/lm_doraemon_feature_selections") && method === "GET") {
      return response(200, selected.map((feature_key, index) => ({
        feature_key,
        selected_at: `2026-09-05T00:00:0${index}Z`,
      })));
    }
    if (url.pathname.endsWith("/lm_codex_jobs") && url.searchParams.has("created_at") && method === "GET") {
      return response(200, []);
    }
    if (url.pathname.endsWith("/lm_codex_jobs") && url.searchParams.get("order") === "created_at.desc" && method === "GET") {
      return response(200, jobs);
    }
    if (url.pathname.endsWith("/enqueue_lm_doraemon_job") && method === "POST") {
      const input = JSON.parse(init.body);
      enqueued = {
        uid: input.p_uid,
        telegram_chat_id: input.p_telegram_chat_id,
        telegram_user_id: input.p_telegram_user_id,
        telegram_message_id: input.p_telegram_message_id,
        telegram_update_id: input.p_telegram_update_id,
        prompt: input.p_prompt,
        mode: "read-only",
        status: "queued",
        job_kind: input.p_job_kind,
        feature_key: input.p_feature_key,
        request_text: input.p_request_text,
        parent_job_id: input.p_parent_job_id,
      };
      const job = { id: JOB_ID, ...enqueued, created_at: "2026-09-05T00:00:00Z" };
      jobs.unshift(job);
      return response(200, { outcome: "created", job });
    }
    if (url.pathname.endsWith("/lm_codex_jobs") && method === "POST") {
      enqueued = JSON.parse(init.body);
      const job = { id: JOB_ID, ...enqueued, created_at: "2026-09-05T00:00:00Z" };
      jobs.unshift(job);
      return response(201, [job]);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  async function postUpdate(update) {
    const body = JSON.stringify(update);
    return new Promise((resolve, reject) => {
      const request = http.request(`http://127.0.0.1:${productionServer.address().port}/telegram`, {
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
  }

  const message = (id, text, replyText) => ({
    update_id: id,
    message: {
      message_id: id + 100,
      date: Math.floor(Date.now() / 1000),
      from: { id: 123456, first_name: "Fixture" },
      chat: { id: 123456, type: "private" },
      text,
      ...(replyText ? { reply_to_message: { message_id: id + 99, text: replyText } } : {}),
    },
  });
  const callback = (id, data) => ({
    update_id: id,
    callback_query: {
      id: `callback-${id}`,
      from: { id: 123456, first_name: "Fixture" },
      data,
      message: { message_id: 500, chat: { id: 123456, type: "private" }, text: "room" },
    },
  });

  try {
    const serverPath = require.resolve("../server.js");
    delete require.cache[serverPath];
    require(serverPath);
    await new Promise((resolve) => productionServer.listen(0, "127.0.0.1", resolve));

    assert.equal(await postUpdate(message(1, "/start f2_w")), 200);
    assert.deepEqual(selected, ["nurture"]);
    assert.match(telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /総合司令室/);

    assert.equal(await postUpdate(callback(2, "dora:room:nurture:w")), 200);
    assert.match(telegram.findLast((call) => call.method === "editMessageText").body.text, /見込み客を育てるの部屋/);

    assert.equal(await postUpdate(callback(3, "dora:start:nurture")), 200);
    const forceReply = telegram.filter((call) => call.method === "sendMessage").at(-1).body;
    assert.equal(forceReply.reply_markup.force_reply, true);
    assert.match(forceReply.text, /【avocadomini依頼:nurture】/);

    assert.equal(await postUpdate(message(4, "無料相談後の返信を3案作って", forceReply.text)), 200);
    assert.equal(enqueued.job_kind, "doraemon_feature");
    assert.equal(enqueued.feature_key, "nurture");
    assert.equal(enqueued.uid, "lm_tg_123456");
    assert.equal(enqueued.mode, "read-only");
    assert.match(enqueued.prompt, /外部への公開・送信・決済/);
    assert.match(telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /受付しました/);

    assert.equal(await postUpdate(message(5, "講座を作って見込み客にも案内したい")), 200);
    assert.equal(enqueued.job_kind, "doraemon_command");
    assert.equal(enqueued.feature_key, null);
    assert.equal(enqueued.uid, "lm_tg_123456");
    assert.match(enqueued.prompt, /総合司令室/);
    assert.match(telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /総合司令室が受付/);

    assert.equal(await postUpdate(message(6, "/today")), 200);
    assert.match(telegram.filter((call) => call.method === "sendMessage").at(-1).body.text, /受付済み/);

    assert.equal(await postUpdate(message(7, "/start")), 200);
    const restored = telegram.filter((call) => call.method === "sendMessage").at(-1).body.text;
    assert.match(restored, /総合司令室/);
    assert.doesNotMatch(restored, /まだ道具を選んでいない/);
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
