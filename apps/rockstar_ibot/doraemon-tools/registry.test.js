"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listDoraemonTools, getDoraemonTool, loadDoraemonToolRegistry } = require("./registry.js");

function fixtureTool(overrides = {}) {
  return {
    schema_version: 1,
    id: "new-tool",
    feature_key: "request",
    order: 110,
    name: "新しい道具",
    actor: "新規BOT",
    description: "新しい仕事を安全に登録するためのテスト用ツールです。",
    emoji: "🧰",
    public_verb: "仕事を進める",
    public_detail: "依頼を整理する",
    room_summary: "依頼を整理します。",
    input_hint: "依頼内容",
    output_hint: "整理結果",
    first_step: "依頼を書いてください。",
    example: "例：これを整理して",
    notices: "受付、完了",
    marketing_title: "依頼を整理する",
    marketing_body: "依頼を整理して使える下書きを作ります。",
    draft_instruction: "依頼を安全に整理してください。",
    phase: "other",
    implementation_state: "catalog_only",
    free_tier_eligible: true,
    effect_class: "none",
    owner_approval: "none",
    receipt_required: false,
    capability_ids: ["new.plan"],
    connector_keys: [],
    maintainers: [],
    ...overrides,
  };
}

test("discovers the ten product tools from independent folders", () => {
  const tools = listDoraemonTools();
  assert.equal(tools.length, 10);
  assert.deepEqual(tools.map((tool) => tool.phase), ["intake", "create", "verify", "sell", "promote", "nurture", "pay", "deliver", "measure", "settle"]);
  assert.equal(getDoraemonTool("course-builder").actor, "教材BOT");
  assert.equal(getDoraemonTool("missing"), null);
  assert.equal(tools.some((tool) => tool.implementation_state === "runtime_ready"), false);
  assert.deepEqual(tools.map((tool) => tool.feature_key), [
    "request", "course", "check", "store", "promote",
    "nurture", "pay", "deliver", "measure", "split",
  ]);
  for (const tool of tools) {
    for (const field of ["emoji", "public_verb", "public_detail", "room_summary", "input_hint", "output_hint", "first_step", "example", "notices", "marketing_title", "marketing_body", "draft_instruction"]) {
      assert.ok(tool[field], `${tool.id}.${field}`);
    }
  }
});

test("the generated marketing-site catalog matches the manifest SSOT", () => {
  const tools = listDoraemonTools();
  const sitePath = path.resolve(__dirname, "../../doraemon-marketing-site/app/doraemon-tool-catalog.json");
  const site = JSON.parse(fs.readFileSync(sitePath, "utf8"));
  assert.deepEqual(site.map((tool) => tool.key), tools.map((tool) => tool.feature_key));
  assert.deepEqual(site.map((tool) => tool.verb), tools.map((tool) => tool.public_verb));
  assert.deepEqual(site.map((tool) => tool.marketingBody), tools.map((tool) => tool.marketing_body));
});

test("the manifest loader automatically discovers a valid tool folder", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doraemon-tools-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "new-tool"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "tool.json"), JSON.stringify(fixtureTool()));
  assert.deepEqual(loadDoraemonToolRegistry({ rootDir: root }).map((tool) => tool.id), ["new-tool"]);
});

test("rejects external effects without per-run approval and receipts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doraemon-tools-"));
  const folder = path.join(root, "unsafe"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "tool.json"), JSON.stringify(fixtureTool({
    id: "unsafe", order: 1, name: "Unsafe", actor: "Unsafe BOT",
    description: "This intentionally invalid tool proves the external-effect guard.",
    free_tier_eligible: false, effect_class: "money", owner_approval: "none",
    capability_ids: ["money.send"], connector_keys: ["stripe"],
  })));
  assert.throws(() => loadDoraemonToolRegistry({ rootDir: root }), /external effect safety/);
  fs.rmSync(root, { recursive: true, force: true });
});
