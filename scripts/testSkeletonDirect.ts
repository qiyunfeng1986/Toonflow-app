import u from "@/utils";
import * as fs from "fs";
import path from "path";

async function main() {
  console.log("直接测试故事骨架 Agent...");
  const startTime = Date.now();
  
  try {
    const skill = path.join(u.getPath("skills"), "script_execution_skeleton.md");
    const systemPrompt = await fs.promises.readFile(skill, "utf-8");
    
    const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<storySkeleton>故事骨架内容</storySkeleton>";
    
    const projectConfig = `【项目配置】
- 集数：3集
- 单集时长：3分钟（约450字台词）
- 原著范围：第1章
- 章节范围：[1]
- 平台规格：竖屏（9:16）
- 风格定位：仙侠穿越、悬疑、轻松搞笑
- 付费策略：前2集免费，第3集付费`;
    
    const prompt = `${projectConfig}\n\n请生成故事骨架。事件表如下：\n| 第1章 黄皮子拦路 | 易灵风、石娃、黄大仙 | 易灵风遇黄皮子拦车避劫遭雷击穿越，结识石娃后于破庙受黄大仙元神传授功法并接下救仙重任 | 强 | 高 | 55秒 | 转折+悬疑+情感 |`;
    
    console.log("调用 AI 生成故事骨架...");
    console.log("System prompt 长度:", systemPrompt.length, "字");
    console.log("User prompt 长度:", prompt.length, "字");
    
    const result = await u.Ai.Text("scriptAgent:storySkeletonAgent", false, 0).stream({
      system: systemPrompt + formatPrompt,
      messages: [
        { role: "user", content: prompt + formatPrompt }
      ],
    });
    
    let fullText = "";
    let chunkCount = 0;
    for await (const chunk of result.fullStream) {
      chunkCount++;
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
        fullText += chunk.text;
      } else if (chunk.type === "reasoning-start") {
        console.log("\n\n[开始思考...]");
      } else if (chunk.type === "reasoning-end") {
        console.log("\n[思考结束]");
      } else if (chunk.type === "tool-call") {
        console.log("\n\n[工具调用]", chunk.toolName);
      } else if (chunk.type === "tool-result") {
        console.log("\n[工具结果]", chunk.toolName);
      } else if (chunk.type === "error") {
        console.error("\n[错误]", chunk.error);
      }
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n✅ 完成！总耗时: ${elapsed.toFixed(1)} 秒`);
    console.log(`输出字数: ${fullText.length} 字`);
    console.log(`Chunk 数量: ${chunkCount}`);
    
    if (fullText.includes("<storySkeleton>")) {
      console.log("\n✅ 检测到 storySkeleton XML 标签");
    }
    
  } catch (err: any) {
    console.error("❌ 错误:", err.message);
    console.error(err.stack);
  }
}

main();
