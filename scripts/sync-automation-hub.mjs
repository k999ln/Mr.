import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = ['index.mjs', 'index.d.mts', 'catalog.json'];
const destination = new URL('apps/rockstar_ibot-hub/app/generated/automation-hub/', root);
const check = process.argv.includes('--check');
if (!check) await mkdir(destination, { recursive: true });
for (const file of files) {
  const source = await readFile(new URL(`packages/automation-hub/${file}`, root));
  if (check) {
    const actual = await readFile(new URL(file, destination));
    if (!actual.equals(source)) throw new Error(`Automation Hub projection is stale: ${file}`);
  } else {
    await writeFile(new URL(file, destination), source);
  }
}
console.log(check ? 'Automation Hub projection matches the shared core.' : 'Automation Hub projection updated.');
