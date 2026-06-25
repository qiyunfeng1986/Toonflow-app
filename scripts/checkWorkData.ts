import u from "@/utils";

async function main() {
  const projectId = 1782373002335;
  
  const row = await u.db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
  if (row) {
    const data = JSON.parse(row.data || "{}");
    console.log("工作区数据:");
    console.log("  storySkeleton:", data.storySkeleton ? data.storySkeleton.length + " 字" : "无");
    console.log("  adaptationStrategy:", data.adaptationStrategy ? data.adaptationStrategy.length + " 字" : "无");
    if (data.storySkeleton) {
      console.log("\n故事骨架前300字:");
      console.log(data.storySkeleton.substring(0, 300) + "...");
    }
  } else {
    console.log("未找到工作区数据");
  }
  
  process.exit(0);
}

main().catch(console.error);
