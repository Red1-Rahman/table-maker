/** Verifies docs/contracts.md documents every exported type in src/types/schema.ts. */
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../src/types/schema.ts', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/contracts.md', import.meta.url), 'utf8');
const names = [...schema.matchAll(/export (?:interface|type) (\w+)/g)].map((m) => m[1]);
const missing = names.filter((n) => !docs.includes(n));
if (missing.length) {
  console.error(`docs/contracts.md is missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`contracts OK (${names.length} types documented)`);
