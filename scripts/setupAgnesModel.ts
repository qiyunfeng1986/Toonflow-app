import u from "@/utils";

async function main() {
  const apiKey = "sk-yWMjou0PzLKsYJco8L8R2Vw3VvLnKBoIqTOJJ4GkBAMGevRq";
  const baseUrl = "https://apihub.agnes-ai.com/v1";

  // 1. 更新 agnesai 供应商配置
  const vendor = await u.db("o_vendorConfig").where("id", "agnesai").first();
  const inputValues = JSON.stringify({ apiKey, baseUrl });

  if (!vendor) {
    await u.db("o_vendorConfig").insert({
      id: "agnesai",
      inputValues,
      models: "[]",
      enable: 1,
    });
    console.log("✅ 创建 agnesai 供应商配置");
  } else {
    await u.db("o_vendorConfig").where("id", "agnesai").update({
      inputValues,
      enable: 1,
    });
    console.log("✅ 更新 agnesai 供应商配置");
  }

  // 2. 获取所有 agent deploy 记录
  const deploys = await u.db("o_agentDeploy").select("*");
  console.log(`\n共找到 ${deploys.length} 个 Agent 部署配置`);

  // 3. 更新所有 Agent 的模型为 agnesai:agnes-2.0-flash
  for (const deploy of deploys) {
    await u.db("o_agentDeploy").where("id", deploy.id).update({
      modelName: "agnesai:agnes-2.0-flash",
    });
    console.log(`✅ 更新: ${deploy.name} (${deploy.key}) -> agnesai:agnes-2.0-flash`);
  }

  console.log("\n🎉 所有模型配置完成！");
  process.exit(0);
}

main().catch(console.error);
