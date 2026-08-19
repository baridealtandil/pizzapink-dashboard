import { query } from "./src/db";
async function main() {
  try {
    const r1 = await query("SELECT * FROM mxtur");
    console.log("mxtur:", r1);
  } catch(e) {}
  try {
    const r2 = await query("SELECT * FROM mxconf LIMIT 1");
    console.log("mxconf:", r2);
  } catch(e) {}
  process.exit(0);
}
main();
