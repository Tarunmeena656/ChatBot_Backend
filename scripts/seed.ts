import { pool } from '../src/db';

const names = ['Aditi Rao', 'Vikram Mehta', 'Neha Singh'];

async function main() {
  for (const name of names) {
    const existing = await pool.query('select id from users where name = $1', [name]);
    if (existing.rows.length === 0) {
      await pool.query('insert into users (name) values ($1)', [name]);
    }
  }
  const { rows } = await pool.query('select id, name from users order by created_at');
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
