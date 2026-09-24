import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(packageDir, "src");
const siteFiles = path.join(packageDir, "site-files");
const targets = process.argv.slice(2);

if (!targets.length) {
  throw new Error("usage: node packages/site-ui/sync.mjs <site-dir> [...site-dir]");
}
if (!fs.statSync(source).isDirectory()) {
  throw new Error(`shared UI source is missing: ${source}`);
}

for (const value of targets) {
  const site = path.resolve(value);
  if (!fs.existsSync(path.join(site, "package.json"))) {
    throw new Error(`site package is missing: ${site}`);
  }
  const destination = path.join(site, "components", "ui");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  fs.writeFileSync(
    path.join(destination, ".generated-from-site-ui"),
    "Generated from packages/site-ui/src. Do not edit this copy.\n",
  );
  for (const relative of ["hooks/use-mobile.ts", "lib/utils.ts", "vite.config.ts"]) {
    const from = path.join(siteFiles, relative);
    const to = path.join(site, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  fs.writeFileSync(
    path.join(site, "next.config.ts"),
    'export { default } from "../../packages/site-ui/next.config.mjs";\n',
  );
  process.stdout.write(`synced shared UI -> ${path.relative(process.cwd(), destination)}\n`);
}
