import { query } from "./src/db";

async function main() {
  console.log("--- mxturape (turnos abiertos?) ---");
  try {
    const res = await query(`SELECT * FROM mxturape LIMIT 10`);
    console.log(res);
  } catch (e) { }

  console.log("--- mxcajape (cajas abiertas?) ---");
  try {
    const res2 = await query(`SELECT * FROM mxcajape LIMIT 10`);
    console.log(res2);
  } catch (e) { }

  console.log("--- mxcierre ---");
  try {
    const res3 = await query(`SELECT * FROM mxcierre LIMIT 10`);
    console.log(res3);
  } catch (e) { }

  console.log("--- mxtufac by hora ---");
  try {
    const res4 = await query(`SELECT hora_sal, total, mesa FROM mxtufac ORDER BY hora_sal DESC LIMIT 20`);
    console.log(res4);
  } catch (e) { }

  process.exit(0);
}
main();
