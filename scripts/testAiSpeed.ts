import u from "@/utils";

async function main() {
  console.log("测试 AI 模型响应速度...");
  const startTime = Date.now();
  
  try {
    const result = await u.Ai.Text("scriptAgent:storySkeletonAgent", false, 0).stream({
      system: "你是一个简短回复助手",
      messages: [
        { role: "user", content: "用一句话介绍什么是故事骨架，不超过50字" }
      ],
    });
    
    let fullText = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
        fullText += chunk.text;
      } else if (chunk.type === "reasoning-start") {
        console.log("\n[开始思考...]");
      } else if (chunk.type === "reasoning-end") {
        console.log("\n[思考结束]");
      }
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n✅ 完成！总耗时: ${elapsed.toFixed(1)} 秒`);
    console.log(`输出字数: ${fullText.length} 字`);
    
  } catch (err: any) {
    console.error("❌ 错误:", err.message);
    console.error(err.stack);
  }
}

main();
