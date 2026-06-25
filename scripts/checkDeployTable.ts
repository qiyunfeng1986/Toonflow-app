import u from "@/utils";

async function main() {
  const row = await u.db("o_agentDeploy").select("*").first();
  console.log("o_agentDeploy 字段:", Object.keys(row || {}));
  console.log("第一条数据:", row);
  
  process.exit(0);
}

main().catch(console.error);
