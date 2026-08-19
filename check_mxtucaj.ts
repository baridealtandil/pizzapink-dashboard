import { query } from "./src/db";
async function main() {
  const res = await query(`SELECT * FROM mxtucaj LIMIT 10`);
  console.log(res);
  process.exit(0);
}
main();
