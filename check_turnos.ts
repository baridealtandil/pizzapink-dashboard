import { query } from "./src/db";

async function main() {
  console.log("--- mxtur ---");
  try {
    const tur = await query("SELECT * FROM mxtur LIMIT 5");
    console.log(tur);
  } catch (e) { console.error(e.message); }

  console.log("\n--- mxape ---");
  try {
    const ape = await query("SELECT * FROM mxape LIMIT 2");
    console.log(ape);
  } catch (e) { console.error(e.message); }

  console.log("\n--- mxtufac ---");
  try {
    const tufac = await query("SELECT * FROM mxtufac ORDER BY fecha DESC, hora DESC LIMIT 5");
    console.log(tufac);
  } catch (e) { console.error(e.message); }

  process.exit(0);
}
main();
