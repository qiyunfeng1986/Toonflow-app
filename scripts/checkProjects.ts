import u from "@/utils";

async function main() {
  const projects = await u.db("o_project").select("*").limit(3);
  console.log("项目字段:", Object.keys(projects[0] || {}));
  console.log("项目数据:", projects);
  
  const novels = await u.db("o_novel").select("*").limit(3);
  console.log("\n小说字段:", Object.keys(novels[0] || {}));
  console.log("小说数据:", novels[0] ? { ...novels[0], content: novels[0].content ? novels[0].content.substring(0, 100) + "..." : null } : "无");
  
  process.exit(0);
}

main().catch(console.error);
