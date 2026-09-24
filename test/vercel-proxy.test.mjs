import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proxyConfigUrl = new URL("../apps/doraemon-vercel-proxy/vercel.json", import.meta.url);
const ownerConfigUrl = new URL("../config/owner-public.json", import.meta.url);

test("the legacy Vercel URL redirects every route to Kai's canonical avocadomini Site", async () => {
  const [proxy, owner] = await Promise.all([
    readFile(proxyConfigUrl, "utf8").then(JSON.parse),
    readFile(ownerConfigUrl, "utf8").then(JSON.parse),
  ]);

  assert.deepEqual(proxy.redirects, [
    {
      source: "/:path*",
      destination: "https://effect-os-verified.kirin-999.chatgpt.site/:path*",
      permanent: false,
    },
  ]);
  assert.equal(owner.links.web, "https://doraos.vercel.app");
  assert.doesNotMatch(JSON.stringify(proxy), /vvvv/i);
});
