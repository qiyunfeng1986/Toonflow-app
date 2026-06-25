import u from "@/utils";

async function main() {
  // 检查供应商配置
  const vendors = await u.db("o_vendorConfig").select("*");
  console.log("供应商配置:");
  vendors.forEach((v: any) => console.log("  ", v.id, v.name, v.type, v.baseUrl));

  // 批量更新剧本Agent的模型
  const scriptAgents = [
    { name: "剧本Agent", agentType: "scriptAgent", modelName: "agnesai:agnes-2.0-flash" },
    { name: "剧本Agent:决策层", agentType: "scriptAgent:decisionAgent", modelName: "agnesai:agnes-2.0-flash" },
    { name: "剧本Agent:监督层", agentType: "scriptAgent:supervisionAgent", modelName: "agnesai:agnes-2.0-flash" },
    { name: "剧本Agent:故事骨架", agentType: "scriptAgent:storySkeleton", modelName: "agnesai:agnes-2.0-flash" },
    { name: "剧本Agent:改编策略", agentType: "scriptAgent:adaptationStrategy", modelName: "agnesai:agnes-2.0-flash" },
    { name: "剧本Agent:剧本生成", agentType: "scriptAgent:script", modelName: "agnesai:agnes-2.0-flash" },
  ];

  for (const agent of scriptAgents) {
    await u.db("o_agentDeploy").where("name", agent.name).update({
      agentType: agent.agentType,
      modelName: agent.modelName,
    });
    console.log(`✅ 更新 ${agent.name}: ${agent.agentType} -> ${agent.modelName}`);
  }

  console.log("\n更新完成!");
  process.exit(0);
}

main().catch(console.error);
