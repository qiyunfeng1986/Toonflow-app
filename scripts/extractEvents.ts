import u from "@/utils";

async function main() {
  const projectId = 1782373002335;
  
  // 获取小说章节
  const chapters = await u.db("o_novel").where({ projectId }).select("id", "chapter", "eventState");
  console.log(`找到 ${chapters.length} 章小说`);
  chapters.forEach((c: any) => console.log(`  ${c.id} - ${c.chapter} - eventState: ${c.eventState}`));
  
  const novelIds = chapters.map((c: any) => c.id);
  
  // 触发事件提取
  const novel = new u.cleanNovel(1);
  await u.db("o_novel").where({ projectId }).whereIn("id", novelIds).update({ eventState: 0, event: null });
  
  novel.emitter.on("item", async (item: any) => {
    await u.db("o_novel")
      .where("id", item.id)
      .update({ event: item.event, eventState: item.event ? 1 : -1, errorReason: item?.errorReason ?? null });
    console.log(`✅ 章节 ${item.id} 事件提取完成`);
  });
  
  novel.emitter.on("complete", async () => {
    console.log("\n🎉 所有章节事件提取完成！");
    
    // 检查结果
    const result = await u.db("o_novel").where({ projectId }).select("id", "chapter", "eventState", "event");
    result.forEach((r: any) => {
      const eventPreview = r.event ? (typeof r.event === 'string' ? r.event.substring(0, 100) : JSON.stringify(r.event).substring(0, 100)) : 'null';
      console.log(`  ${r.id} - ${r.chapter} - eventState: ${r.eventState} - ${eventPreview}...`);
    });
    
    process.exit(0);
  });
  
  console.log("\n开始提取事件...\n");
  novel.start(chapters, projectId);
}

main().catch(console.error);
