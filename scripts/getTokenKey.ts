import u from "@/utils";

async function main() {
  const setting = await u.db("o_setting").where("key", "tokenKey").first();
  console.log("tokenKey:", setting?.value);
  
  process.exit(0);
}

main().catch(console.error);
