import 'dotenv/config';
import mysql from 'mysql2/promise';
async function run() {
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await pool.query("SELECT hora_sal, total FROM mxfac WHERE fecha = '2026-07-09' ORDER BY hora_sal ASC LIMIT 5");
  console.log(rows);
  pool.end();
}
run();
