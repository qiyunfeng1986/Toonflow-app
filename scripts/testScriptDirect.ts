import u from "@/utils";
import { tool, jsonSchema } from "ai";
import { z } from "zod";
import * as fs from "fs";
import path from "path";

async function main() {
  console.log("测试剧本生成 Agent...");
  const startTime = Date.now();
  
  try {
    const skill = path.join(u.getPath("skills"), "script_execution_script.md");
    const systemPrompt = await fs.promises.readFile(skill, "utf-8");
    
    const formatPrompt = `\n你必须使用如下XML格式写入工作区：\nXML不得添加任何额外标签<scriptItem name="剧本名称">剧本内容</scriptItem>`;
    
    const projectConfig = `【项目配置】
- 集数：3集
- 单集时长：3分钟（约450字台词）
- 原著范围：第1章
- 章节范围：[1]
- 平台规格：竖屏（9:16）
- 风格定位：仙侠穿越、悬疑、轻松搞笑
- 付费策略：前2集免费，第3集付费`;
    
    const storySkeleton = fs.readFileSync("/tmp/skeleton.txt", "utf-8");
    const adaptationStrategy = fs.readFileSync("/tmp/adaptation.txt", "utf-8");
    
    const novelText = await (async () => {
      const Database = require("better-sqlite3");
      const db = new Database(path.join(process.cwd(), "data/db2.sqlite"));
      const row = db.prepare("SELECT chapterData FROM o_novel WHERE projectId = ? AND chapterIndex = ?").get(1782322991, 1);
      db.close();
      return row?.chapterData || "";
    })();
    
    const prompt = `${projectConfig}

请生成第1集剧本。

## 故事骨架
${storySkeleton}

## 改编策略
${adaptationStrategy}

## 第1章原文
${novelText.substring(0, 2000)}`;
    
    const testTools = {
      get_planData: tool({
        description: "获取工作区数据",
        parameters: z.object({
          key: z.enum(["storySkeleton", "adaptationStrategy", "script"]),
        }),
        execute: async ({ key }) => {
          console.log(`\n🔧 [工具调用] get_planData(${key})`);
          if (key === "storySkeleton") return storySkeleton;
          if (key === "adaptationStrategy") return adaptationStrategy;
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
      get_novel_text: tool({
        description: "获取小说章节原文",
        parameters: z.object({
          chapterIndex: z.string(),
        }),
        execute: async ({ chapterIndex }) => {
          console.log(`\n🔧 [工具调用] get_novel_text(${chapterIndex})`);
          return novelText;
        },
      }),
      get_script_content: tool({
        description: "获取剧本内容",
        parameters: z.object({
          ids: z.array(z.string()),
        }),
        execute: async ({ ids }) => {
          console.log(`\n🔧 [工具调用] get_script_content(${JSON.stringify(ids)})`);
          return "";
        },
      }),
    };
    
    console.log("调用 AI 生成剧本...");
    console.log("System prompt 长度:", systemPrompt.length, "字");
    console.log("Novel text 长度:", novelText.length, "字");
    
    const result = await u.Ai.Text("scriptAgent:scriptAgent", false, 0).stream({
      system: systemPrompt + formatPrompt,
      messages: [
        { role: "assistant", content: `可用剧本(ID:名称)\n章节数量：1章` },
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
    
    const scriptItemMatch = fullText.match(/<scriptItem name="([^"]+)">([\s\S]*?)<\/scriptItem>/);
    if (scriptItemMatch) {
      console.log("\n✅ 检测到 scriptItem XML 标签");
      console.log("剧本名称:", scriptItemMatch[1]);
      console.log("剧本长度:", scriptItemMatch[2].trim().length, "字");
      fs.writeFileSync("/tmp/script1.txt", `# ${scriptItemMatch[1]}\n\n${scriptItemMatch[2].trim()}`);
      console.log("已保存到 /tmp/script1.txt");
    }
    
  } catch (err: any) {
    console.error("❌ 错误:", err.message);
    console.error(err.stack);
  }
}

main();
