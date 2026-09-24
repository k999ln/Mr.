"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../migrations/2026-09-04-lm-doraemon-job-workflow.sql"), "utf8");

test("Doraemon job migration makes enqueue atomic and service-role-only", () => {
  assert.match(sql, /enqueue_lm_doraemon_job/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /telegram_chat_id\s*=\s*p_telegram_chat_id[\s\S]*telegram_message_id\s*=\s*p_telegram_message_id/);
  assert.match(sql, /created_at\s*>=\s*clock_timestamp\(\)\s*-\s*interval '1 hour'/);
  assert.match(sql, />= 10/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enqueue_lm_doraemon_job[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.enqueue_lm_doraemon_job[\s\S]*TO service_role/);
});

test("Doraemon completion requires a delivered Telegram receipt", () => {
  assert.match(sql, /accepted_at IS NULL[\s\S]*status = 'completed'[\s\S]*telegram_result_message_id IS NOT NULL/);
  assert.match(sql, /accept_lm_doraemon_job[\s\S]*telegram_chat_id = p_telegram_chat_id[\s\S]*telegram_result_message_id IS NOT NULL/);
});
