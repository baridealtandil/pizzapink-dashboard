import { query } from "./src/db";
async function run() {
  console.log(await query("SHOW INDEXES FROM mxite;"));
  console.log(await query("EXPLAIN SELECT SUM(total) FROM mxfac WHERE fecha = '2026-07-11';"));
  process.exit(0);
}
run();
