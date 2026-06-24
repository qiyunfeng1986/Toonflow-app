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

function getWorkData(): any {
  const db = new Database(DB_PATH);
  const row = db.prepare("SELECT * FROM o_agentWorkData WHERE projectId = ? AND key = ?").get(PROJECT_ID, "scriptAgent") as any;
  db.close();
  return row ? JSON.parse(row.data || "{}") : {};
}

function printWorkData(label: string) {
  const data = getWorkData();
  console.log(`\n📊 ${label}:`);
  console.log(`  故事骨架: ${data.storySkeleton ? "✅ " + data.storySkeleton.length + "字" : "❌ 未生成"}`);
  console.log(`  改编策略: ${data.adaptationStrategy ? "✅ " + data.adaptationStrategy.length + "字" : "❌ 未生成"}`);
  
  const db = new Database(DB_PATH);
  const scripts = db.prepare("SELECT * FROM o_script WHERE projectId = ?").all(PROJECT_ID) as any[];
  db.close();
  console.log(`  剧本数量: ${scripts.length} 个`);
}

async function main() {
  printWorkData("初始状态");
  
  const token = await getToken();
  console.log("\n✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "full-pipeline-v2",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  const startTime = Date.now();
  let currentContent = "";
  let messageCount = 0;
  let toolCalls: any[] = [];

  socket.on("message", (data: any) => {
    messageCount++;
    currentContent = "";
    toolCalls = [];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[${elapsed}s] 📨 消息 #${messageCount} [${data.role}/${data.name || "unknown"}]`);
  });

  socket.on("content:update", (data: any) => {
    if (data.type === "text" && data.data) {
      currentContent += data.data;
    } else if (data.type === "tool-call") {
      toolCalls.push(data);
      console.log(`  🔧 工具调用: ${data.toolName || data.name}`);
    }
  });

  socket.on("message:update", (data: any) => {
    if (data.status === "complete") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const preview = currentContent.length > 200 ? currentContent.substring(0, 200) + "..." : currentContent;
      console.log(`[${elapsed}s] ✅ 完成: ${preview}`);
      
      if (currentContent.includes("<storySkeleton>")) {
        console.log(`[${elapsed}s] 📝 检测到 storySkeleton XML 标签`);
      }
      if (currentContent.includes("<adaptationStrategy>")) {
        console.log(`[${elapsed}s] 📝 检测到 adaptationStrategy XML 标签`);
      }
      
      printWorkData("当前工作区");
    }
  });

  socket.on("connect", async () => {
    console.log("✅ Socket 连接成功");
    console.log("\n" + "=".repeat(60));
    console.log("🚀 阶段1：生成故事骨架");
    console.log("=".repeat(60));
    
    socket.emit("chat", {
      content: "请生成故事骨架。首先调用get_novel_events获取第1章的事件，然后调用run_sub_agent_storySkeleton让编剧生成故事骨架，最后调用run_supervision_agent让编辑进行审核。",
    });
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  socket.on("error", (err: any) => {
    console.error("❌ 错误:", err);
  });

  setTimeout(() => {
    console.log("\n⏰ 300秒超时，最终状态:");
    printWorkData("最终状态");
    socket.disconnect();
    process.exit(0);
  }, 300000);
}

main();
