require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function reset() {
  await client.connect();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('sakshi123', salt);
  const res = await client.query('UPDATE users SET password = $1 WHERE email = $2 RETURNING email', [hash, 'sakshi87@gmail.com']);
  console.log('Updated:', res.rows);
  await client.end();
}

reset().catch(console.error);
