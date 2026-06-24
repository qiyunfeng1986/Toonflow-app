import { io } from "socket.io-client";
import Database from "better-sqlite3";
import path from "path";

const SERVER_URL = "http://127.0.0.1:10588";
const PROJECT_ID = 1782322991;
const DB_PATH = path.join(process.cwd(), "data/db2.sqlite");

async function getToken(): Promise<string> {
  const response = await fetch(`${SERVER_URL}/api/login/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const data = await response.json();
  const token = data.data.token;
  return token.startsWith("Bearer ") ? token.substring(7) : token;
}

function clearWorkData() {
  const db = new Database(DB_PATH);
  db.prepare("DELETE FROM o_agentWorkData WHERE projectId = ? AND key = 'scriptAgent'").run(PROJECT_ID);
  db.prepare("DELETE FROM o_script WHERE projectId = ?").run(PROJECT_ID);
  console.log("✅ 已清空 scriptAgent 工作区数据");
  db.close();
}

async function main() {
  clearWorkData();
  
  const token = await getToken();
  console.log("✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "full-pipeline-test",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  let messageCount = 0;
  let startTime = Date.now();

  socket.on("connect", async () => {
    console.log("✅ Socket 连接成功");
    console.log("\n" + "=".repeat(60));
    console.log("🚀 启动 ScriptAgent 完整流水线");
    console.log("=".repeat(60));
    
    socket.emit("chat", {
      content: "你好，请开始工作。第一步：生成故事骨架。请调用事件提取工具获取小说事件，然后调用编剧生成故事骨架，最后请编辑进行审核。",
    });
  });

  let currentMessage: any = {};

  socket.on("message", (data: any) => {
    currentMessage = { ...data, content: "" };
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    messageCount++;
    const role = data.role || "unknown";
    const name = data.name || "";
    console.log(`\n[${elapsed}s] 📨 新消息 [${role}/${name}] (msg#${messageCount})`);
  });

  socket.on("content:add", (data: any) => {
    if (data.content) {
      currentMessage.content = (currentMessage.content || "") + data.content;
    }
  });

  socket.on("message:update", (data: any) => {
    if (data.status === "complete") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const content = currentMessage.content || "";
      const preview = content.length > 200 ? content.substring(0, 200) + "..." : content;
      console.log(`[${elapsed}s] ✅ 消息完成: ${preview}`);
      
      if (content.includes("<storySkeleton>") || content.includes("</adaptationStrategy>")) {
        console.log(`[${elapsed}s] 📝 检测到工作区写入标签`);
      }
    }
  });

  socket.on("error", (err: any) => {
    console.error("❌ 错误:", err);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  socket.on("disconnect", () => {
    console.log("\n🔌 连接断开");
    process.exit(0);
  });

  setTimeout(() => {
    console.log("\n⏰ 600秒超时，检查当前状态...");
    checkWorkData();
  }, 600000);
}

function checkWorkData() {
  const db = new Database(DB_PATH);
  const row = db.prepare("SELECT * FROM o_agentWorkData WHERE projectId = ? AND key = 'scriptAgent'").get(PROJECT_ID) as any;
  
  if (row) {
    const data = JSON.parse(row.data || "{}");
    console.log("\n" + "=".repeat(60));
    console.log("📊 当前工作区状态:");
    console.log("=".repeat(60));
    console.log(`  故事骨架: ${data.storySkeleton ? "✅ 已生成 (" + data.storySkeleton.length + "字)" : "❌ 未生成"}`);
    console.log(`  改编策略: ${data.adaptationStrategy ? "✅ 已生成 (" + data.adaptationStrategy.length + "字)" : "❌ 未生成"}`);
  } else {
    console.log("\n❌ 工作区数据不存在");
  }
  
  const scripts = db.prepare("SELECT * FROM o_script WHERE projectId = ?").all(PROJECT_ID) as any[];
  console.log(`  剧本数量: ${scripts.length} 个`);
  
  db.close();
}

main();
