import u from "@/utils";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const projectId = Date.now();
  console.log("创建项目 ID:", projectId);

  // 1. 创建项目
  await u.db("o_project").insert({
    id: projectId,
    projectType: "shortDrama",
    name: "测试项目 - 都市穿越仙侠",
    intro: "现代都市穿越仙侠题材测试项目",
    type: "仙侠",
    artStyle: "2D_chinese_guofeng",
    directorManual: "",
    videoRatio: "9:16",
    imageModel: "agnesai:agnes-2.0-flash",
    videoModel: "agnesai:agnes-2.0-flash",
    imageQuality: "标准",
    mode: "{}",
    userId: 1,
    createTime: Date.now(),
  });
  console.log("✅ 项目创建成功");

  // 2. 读取小说内容
  const novelPath = path.join(process.cwd(), "data", "novel_sample.txt");
  const novelContent = fs.readFileSync(novelPath, "utf-8");
  
  // 分割章节（简单处理，按"第X章"分割）
  const chapterRegex = /第[一二三四五六七八九十百千\d]+章/g;
  const matches = [...novelContent.matchAll(chapterRegex)];
  
  const chapters: { index: number; reel: string; chapter: string; chapterData: string }[] = [];
  
  if (matches.length === 0) {
    // 没有章节标题，作为单章处理
    chapters.push({
      index: 1,
      reel: "第一卷",
      chapter: "第一章",
      chapterData: novelContent,
    });
  } else {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index! + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index! : novelContent.length;
      const chapterTitle = matches[i][0];
      const chapterData = novelContent.slice(start, end).trim();
      
      chapters.push({
        index: i + 1,
        reel: "第一卷",
        chapter: chapterTitle,
        chapterData: chapterData,
      });
    }
  }
  
  console.log(`✅ 读取到 ${chapters.length} 章小说`);

  // 3. 导入小说
  let chapterIndex = 0;
  for (const item of chapters) {
    chapterIndex++;
    await u.db("o_novel").insert({
      projectId,
      chapterIndex,
      reel: item.reel,
      chapter: item.chapter,
      chapterData: item.chapterData,
      createTime: Date.now(),
      eventState: 0,
    });
  }
  console.log(`✅ 导入 ${chapters.length} 章小说`);
  
  console.log("\n🎉 项目创建完成！项目 ID:", projectId);
  process.exit(0);
}

main().catch(console.error);
