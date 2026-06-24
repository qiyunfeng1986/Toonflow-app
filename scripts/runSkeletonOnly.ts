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

const PARAMS = `
好的，以下是项目参数：

1. **集数**：3集
2. **每集时长**：约3分钟
3. **覆盖章节**：第1章（全部内容）
4. **平台规格**：竖屏（9:16）
5. **风格定位**：仙侠穿越、悬疑、轻松搞笑
6. **付费策略**：前2集免费，第3集设置付费点

请开始生成故事骨架。
`;

let paramsSent = false;
let messageCount = 0;

async function main() {
  const token = await getToken();
  console.log("✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "skeleton-only-v2",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  const startTime = Date.now();
  let currentContent = "";
  let currentName = "";
  let toolCallCount = 0;

  socket.on("message", (data: any) => {
    messageCount++;
    currentContent = "";
    currentName = data.name || "unknown";
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[${elapsed}s] 📨 #${messageCount} [${data.role}/${currentName}]`);
  });

  socket.on("content:update", (data: any) => {
    if (data.type === "text" && data.data) {
      currentContent += data.data;
    } else if (data.type === "tool-call") {
      toolCallCount++;
      console.log(`  🔧 工具调用 #${toolCallCount}: ${data.toolName || data.name || "unknown"}`);
      if (data.args) {
        console.log(`     参数: ${JSON.stringify(data.args).substring(0, 100)}`);
      }
    } else if (data.type === "tool-result") {
      console.log(`  ✅ 工具结果: ${data.toolName || data.name || "unknown"}`);
      if (data.result) {
        const resultStr = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
        console.log(`     结果: ${resultStr.substring(0, 100)}...`);
      }
    }
  });

  socket.on("message:update", (data: any) => {
    if (data.status === "complete") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const workData = getWorkData();
      const hasSkeleton = !!workData.storySkeleton;
      
      if (currentContent.trim()) {
        const preview = currentContent.length > 150 ? currentContent.substring(0, 150) + "..." : currentContent;
        console.log(`[${elapsed}s] ✅ 完成 [${currentName}]: ${preview}`);
      } else {
        console.log(`[${elapsed}s] ✅ 完成 [${currentName}]: (空内容)`);
      }
      
      console.log(`[${elapsed}s] 📊 故事骨架: ${hasSkeleton ? "✅ " + workData.storySkeleton.length + "字" : "❌ 未生成"}`);
      
      if (!paramsSent && !hasSkeleton && currentContent.includes("集数") && messageCount <= 2) {
        paramsSent = true;
        console.log(`[${elapsed}s] 📝 发送项目参数...`);
        setTimeout(() => {
          socket.emit("chat", { content: PARAMS });
        }, 1000);
      }
      
      if (hasSkeleton) {
        console.log(`\n[${elapsed}s] 🎉 故事骨架生成成功！`);
        console.log("=".repeat(60));
        console.log(workData.storySkeleton.substring(0, 500) + "...");
        console.log("=".repeat(60));
        setTimeout(() => {
          socket.disconnect();
          process.exit(0);
        }, 2000);
      }
    }
  });

  socket.on("connect", async () => {
    console.log("✅ Socket 连接成功");
    console.log("\n" + "=".repeat(60));
    console.log("🚀 开始生成故事骨架");
    console.log("=".repeat(60));
    
    socket.emit("chat", {
      content: "请生成故事骨架。",
    });
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.log("\n⏰ 600秒超时");
    const workData = getWorkData();
    console.log("最终状态:");
    console.log(`  故事骨架: ${workData.storySkeleton ? "✅ " + workData.storySkeleton.length + "字" : "❌ 未生成"}`);
    if (workData.storySkeleton) {
      console.log("\n内容预览:");
      console.log(workData.storySkeleton.substring(0, 300) + "...");
    }
    socket.disconnect();
    process.exit(0);
  }, 600000);
}

main();
