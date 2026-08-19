import 'dotenv/config';
import mysql from 'mysql2/promise';
async function run() {
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const cutoff = (23 - 7) * 60 + 59;
  const sql = `SELECT SUM(total) as t FROM mxfac WHERE fecha = '2026-07-09'`;
  const [rows] = await pool.query(sql);
  console.log("Full day:", rows[0].t);
  
  const sql2 = `SELECT SUM(total) as t FROM mxfac WHERE fecha = '2026-07-09' AND (CASE WHEN HOUR(hora_sal) >= 3 THEN (HOUR(hora_sal)-7)*60+MINUTE(hora_sal) ELSE (17+HOUR(hora_sal))*60+MINUTE(hora_sal) END) <= 544`;
  const [rows2] = await pool.query(sql2);
  console.log("Cutoff 16:04:", rows2[0].t);
  pool.end();
}
run();
