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

async function main() {
  const initialData = getWorkData();
  console.log("初始状态 - 故事骨架:", initialData.storySkeleton ? "✅" : "❌");
  
  const token = await getToken();
  console.log("✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "direct-skeleton-test",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  const startTime = Date.now();
  let messageCount = 0;

  socket.onAny((event, ...args) => {
    if (event === "message") return;
    if (event === "content:update") return;
    if (event === "message:update") return;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] 📡 事件: ${event}`, JSON.stringify(args[0]).substring(0, 100));
  });

  socket.on("message", (data: any) => {
    messageCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[${elapsed}s] 📨 #${messageCount} [${data.role}/${data.name || "unknown"}]`);
  });

  socket.on("content:update", (data: any) => {
    if (data.type === "text" && data.data) {
      process.stdout.write(data.data);
    } else if (data.type === "tool-call") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[${elapsed}s] 🔧 工具调用: ${data.toolName || data.name}`);
    } else if (data.type === "tool-result") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[${elapsed}s] ✅ 工具结果: ${data.toolName || data.name}`);
    }
  });

  socket.on("message:update", (data: any) => {
    if (data.status === "complete") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const workData = getWorkData();
      console.log(`\n\n[${elapsed}s] ✅ 消息完成`);
      console.log(`[${elapsed}s] 📊 故事骨架: ${workData.storySkeleton ? workData.storySkeleton.length + "字" : "未生成"}`);
      
      if (workData.storySkeleton) {
        console.log("\n🎉 成功！故事骨架已生成");
        setTimeout(() => {
          socket.disconnect();
          process.exit(0);
        }, 2000);
      }
    }
  });

  socket.on("connect", async () => {
    console.log("✅ Socket 连接成功");
    console.log("\n🚀 直接发送指令，要求调用 run_sub_agent_storySkeleton 工具...\n");
    
    const prompt = `【项目配置】
- 集数：3集
- 单集时长：3分钟（约450字台词）
- 原著范围：第1章
- 章节范围：[1]
- 平台规格：竖屏（9:16）
- 风格定位：仙侠穿越、悬疑、轻松搞笑
- 付费策略：前2集免费，第3集付费

请立即调用 run_sub_agent_storySkeleton 工具来生成故事骨架。prompt 参数请基于以上配置构建，要求生成完整的故事骨架，包括三幕结构、分集梗概、核心冲突等。`;

    socket.emit("chat", { content: prompt });
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.log("\n⏰ 600秒超时");
    const workData = getWorkData();
    console.log("最终状态 - 故事骨架:", workData.storySkeleton ? workData.storySkeleton.length + "字" : "未生成");
    if (workData.storySkeleton) {
      console.log("\n内容预览:");
      console.log(workData.storySkeleton.substring(0, 300) + "...");
    }
    socket.disconnect();
    process.exit(0);
  }, 600000);
}

main();
