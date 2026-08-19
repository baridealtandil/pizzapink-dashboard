import 'dotenv/config';
import mysql from 'mysql2/promise';
async function run() {
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const cutoff = (16 - 7) * 60 + 4;
  const sql = `SELECT hora_sal, total FROM mxfac WHERE fecha = '2026-07-09' AND (CASE WHEN HOUR(hora_sal) >= 3 THEN (HOUR(hora_sal)-7)*60+MINUTE(hora_sal) ELSE (17+HOUR(hora_sal))*60+MINUTE(hora_sal) END) <= ${cutoff} LIMIT 20`;
  const [rows] = await pool.query(sql);
  console.log(rows);
  pool.end();
}
run();
