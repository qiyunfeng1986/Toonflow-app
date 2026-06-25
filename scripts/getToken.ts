import u from "@/utils";

async function main() {
  const users = await u.db("o_user").select("*").limit(1);
  console.log("用户表字段:", Object.keys(users[0] || {}));
  console.log("用户数据:", users[0]);
  
  process.exit(0);
}

main().catch(console.error);
