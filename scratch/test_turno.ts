import { query } from "/Users/macbookairnueva/barideal-dashboard/src/db";

async function test() {
  try {
    console.log("Querying mxpaa...");
    const pa = await query("SELECT * FROM mxpaa");
    console.log("mxpaa data:", pa);
  } catch (e) {
    console.error("FAIL mxpaa:", e);
  }
}

test().then(() => process.exit(0));
