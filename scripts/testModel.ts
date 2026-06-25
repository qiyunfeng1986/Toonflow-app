import u from "@/utils";

async function main() {
  console.log("测试 Agnes-2.0-Flash 模型调用...\n");
  
  try {
    const { text } = await u.Ai.Text("scriptAgent").invoke({
      messages: [
        { role: "system", content: "你是一个测试助手。" },
        { role: "user", content: "请用一句话回复：模型连接测试成功" },
      ],
    });
    
    console.log("✅ 模型调用成功！");
    console.log("回复内容:", text);
  } catch (e: any) {
    console.error("❌ 模型调用失败:", e.message);
    console.error(e.stack);
  }
  
  process.exit(0);
}

main().catch(console.error);
