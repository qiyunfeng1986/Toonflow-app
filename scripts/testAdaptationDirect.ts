import u from "@/utils";
import { tool, jsonSchema } from "ai";
import { z } from "zod";
import * as fs from "fs";
import path from "path";

async function main() {
  console.log("测试改编策略 Agent...");
  const startTime = Date.now();
  
  try {
    const skill = path.join(u.getPath("skills"), "script_execution_adaptation.md");
    const systemPrompt = await fs.promises.readFile(skill, "utf-8");
    
    const formatPrompt = "\n你必须使用如下XML格式写入工作区：\n<adaptationStrategy>改编策略内容</adaptationStrategy>";
    
    const projectConfig = `【项目配置】
- 集数：3集
- 单集时长：3分钟（约450字台词）
- 原著范围：第1章
- 章节范围：[1]
- 平台规格：竖屏（9:16）
- 风格定位：仙侠穿越、悬疑、轻松搞笑
- 付费策略：前2集免费，第3集付费`;
    
    const storySkeleton = fs.readFileSync("/tmp/skeleton.txt", "utf-8");
    
    const prompt = `${projectConfig}\n\n请基于以下故事骨架生成改编策略。\n\n## 故事骨架\n${storySkeleton}`;
    
    const testTools = {
      get_planData: tool({
        description: "获取工作区数据",
        parameters: z.object({
          key: z.enum(["storySkeleton", "adaptationStrategy", "script"]),
        }),
        execute: async ({ key }) => {
          console.log(`\n🔧 [工具调用] get_planData(${key})`);
          if (key === "storySkeleton") return storySkeleton;
          return "";
        },
      }),
      get_novel_events: tool({
        description: "获取章节事件",
        parameters: z.object({
          chapterIndexs: z.array(z.number()),
        }),
        execute: async ({ chapterIndexs }) => {
          console.log(`\n🔧 [工具调用] get_novel_events(${JSON.stringify(chapterIndexs)})`);
          return "| 第1章 黄皮子拦路 | 易灵风、石娃、黄大仙 | 易灵风遇黄皮子拦车避劫遭雷击穿越，结识石娃后于破庙受黄大仙元神传授功法并接下救仙重任 | 强 | 高 | 55秒 | 转折+悬疑+情感 |";
        },
      }),
    };
    
    console.log("调用 AI 生成改编策略...");
    console.log("System prompt 长度:", systemPrompt.length, "字");
    console.log("Story skeleton 长度:", storySkeleton.length, "字");
    
    const result = await u.Ai.Text("scriptAgent:adaptationStrategyAgent", false, 0).stream({
      system: systemPrompt + formatPrompt,
      messages: [
        { role: "user", content: prompt + formatPrompt }
      ],
      tools: testTools,
    });
    
    let fullText = "";
    let toolCallCount = 0;
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
        fullText += chunk.text;
      } else if (chunk.type === "reasoning-start") {
        console.log("\n\n[开始思考...]");
      } else if (chunk.type === "reasoning-end") {
        console.log("\n[思考结束]");
      } else if (chunk.type === "tool-call") {
        toolCallCount++;
        console.log(`\n\n[工具调用 #${toolCallCount}]`, chunk.toolName);
      } else if (chunk.type === "tool-result") {
        console.log(`\n[工具结果]`, chunk.toolName);
      } else if (chunk.type === "error") {
        console.error("\n[错误]", chunk.error);
      }
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n✅ 完成！总耗时: ${elapsed.toFixed(1)} 秒`);
    console.log(`输出字数: ${fullText.length} 字`);
    console.log(`工具调用次数: ${toolCallCount}`);
    
    if (fullText.includes("<adaptationStrategy>")) {
      console.log("\n✅ 检测到 adaptationStrategy XML 标签");
      const match = fullText.match(/<adaptationStrategy>([\s\S]*?)<\/adaptationStrategy>/);
      if (match) {
        const strategy = match[1].trim();
        console.log("改编策略长度:", strategy.length, "字");
        fs.writeFileSync("/tmp/adaptation.txt", strategy);
        console.log("已保存到 /tmp/adaptation.txt");
      }
    }
    
  } catch (err: any) {
    console.error("❌ 错误:", err.message);
    console.error(err.stack);
  }
}

main();
