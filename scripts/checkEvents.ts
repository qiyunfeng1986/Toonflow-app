import u from "@/utils";

async function main() {
  const projectId = 1782373002335;
  
  const chapters = await u.db("o_novel").where({ projectId }).select("id", "chapter", "eventState", "event");
  console.log("章节事件提取状态:");
  chapters.forEach((c: any) => {
    const eventStr = c.event ? (typeof c.event === "string" ? c.event : JSON.stringify(c.event)) : "";
    console.log(`  ${c.id} - ${c.chapter} - eventState: ${c.eventState}`);
    if (eventStr) {
      console.log(`    事件: ${eventStr.substring(0, 200)}...`);
    }
  });
  
  process.exit(0);
}

main().catch(console.error);
