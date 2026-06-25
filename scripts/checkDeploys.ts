import u from "@/utils";

async function main() {
  const deploys = await u.db("o_agentDeploy").select("*");
  console.log("Agent部署列表:");
  deploys.forEach((d: any) => console.log("  ", d.id, d.name, d.agentType, d.modelName));
  
  process.exit(0);
}

main().catch(console.error);
