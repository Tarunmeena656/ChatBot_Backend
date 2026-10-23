import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db';

async function main() {
  const sql = readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('schema applied');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
