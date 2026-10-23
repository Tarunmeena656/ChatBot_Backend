import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

export default function setup() {
  const env = { ...dotenv.parse(readFileSync('.env.test')), ...process.env };
  execSync('npx tsx scripts/migrate.ts', { env, stdio: 'inherit' });
}
