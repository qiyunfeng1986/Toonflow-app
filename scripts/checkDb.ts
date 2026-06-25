import u from "@/utils";

async function main() {
  const projectId = 1782322991;
  
  const row = await u.db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
  if (row) {
    const data = JSON.parse(row.data || "{}");
    console.log("工作区数据:");
    console.log("  storySkeleton:", data.storySkeleton ? data.storySkeleton.length + " 字" : "无");
    console.log("  adaptationStrategy:", data.adaptationStrategy ? data.adaptationStrategy.length + " 字" : "无");
    console.log("  script:", data.script ? (Array.isArray(data.script) ? data.script.length + " 个" : "有数据") : "无");
  } else {
    console.log("未找到工作区数据");
  }

  const scripts = await u.db("o_script").where({ projectId }).select("id", "name");
  console.log("\n剧本列表:");
  if (scripts.length === 0) {
    console.log("  无");
  } else {
    scripts.forEach((s: any) => console.log("  ", s.id, s.name));
  }
  
  process.exit(0);
}

main().catch(console.error);
