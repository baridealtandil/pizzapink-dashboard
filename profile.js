import 'dotenv/config';
import mysql from 'mysql2/promise';

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5
  });
  
  async function query(sql, params) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  
  const hoy = '2026-07-16';
  
  console.time('total');
  
  const q1 = query(`SELECT SUM(t.total) AS total FROM (SELECT SUM(total) as total FROM mxfac WHERE fecha = ? UNION ALL SELECT SUM(total) as total FROM mxtufac WHERE fecha = ?) t`, [hoy, hoy]);
  const q2 = query(`SELECT SUM(t.total) AS total FROM (SELECT SUM(total) as total FROM mxfac WHERE fecha = ? UNION ALL SELECT SUM(total) as total FROM mxtufac WHERE fecha = ?) t`, ['2026-07-09', '2026-07-09']);
  
  const q3 = query(`SELECT SUM(comensales_mesa) as comensales_mesa FROM (
       SELECT SUM(t.cant_srv) AS comensales_mesa
       FROM (
         SELECT f.total, SUM(srv.cantidad) AS cant_srv
         FROM mxfac f
         JOIN mxite srv
           ON srv.fecha = f.fecha AND srv.numero = f.numero
          AND srv.cod_cpb = f.cod_cpb AND srv.prefijo = f.prefijo
         WHERE f.fecha BETWEEN ? AND ?
         GROUP BY f.fecha, f.numero, f.cod_cpb, f.prefijo, f.total
       ) t
       WHERE t.cant_srv > 0
     ) r`, [hoy, hoy]);
     
  const q4 = query(`SELECT COUNT(*) FROM mxape`, []);
  const q5 = query(`SELECT cod_for FROM mxctc WHERE fecha = ?`, [hoy]);

  await Promise.all([q1, q2, q3, q4, q5]);
  
  console.timeEnd('total');
  pool.end();
}
run();
