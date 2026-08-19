require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [indexesFac] = await pool.query("SHOW INDEXES FROM mxfac");
  const [indexesIte] = await pool.query("SHOW INDEXES FROM mxite");
  console.log("mxfac indexes:", indexesFac.map(i => i.Key_name + ' -> ' + i.Column_name));
  console.log("mxite indexes:", indexesIte.map(i => i.Key_name + ' -> ' + i.Column_name));
  pool.end();
}
run();
