import u from "@/utils";

async function main() {
  const row = await u.db("o_vendorConfig").select("*").first();
  console.log("o_vendorConfig 字段:", Object.keys(row || {}));
  console.log("第一条数据:", row);
  
  process.exit(0);
}

main().catch(console.error);
