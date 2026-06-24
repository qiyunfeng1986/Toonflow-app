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
  return data;
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

let phase = 1;
let lastResponseTime = Date.now();

async function main() {
  printWorkData("初始状态");
  
  const token = await getToken();
  console.log("\n✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "pipeline-v3",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  const startTime = Date.now();
  let currentContent = "";
  let messageCount = 0;

  socket.on("message", (data: any) => {
    messageCount++;
    currentContent = "";
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[${elapsed}s] 📨 消息 #${messageCount} [${data.role}/${data.name || "unknown"}]`);
  });

  socket.on("content:update", (data: any) => {
    if (data.type === "text" && data.data) {
      currentContent += data.data;
      lastResponseTime = Date.now();
    }
  });

  socket.on("message:update", (data: any) => {
    if (data.status === "complete") {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const preview = currentContent.length > 200 ? currentContent.substring(0, 200) + "..." : currentContent;
      console.log(`[${elapsed}s] ✅ 完成: ${preview}`);
      
      const workData = printWorkData("当前工作区");
      
      if (phase === 1 && !workData.storySkeleton && (currentContent.includes("集数") || currentContent.includes("参数") || currentContent.includes("确认") || currentContent.includes("计划拆分"))) {
        console.log(`\n[${elapsed}s] 📝 检测到参数询问，自动提供参数...`);
        setTimeout(() => {
          socket.emit("chat", { content: PARAMS });
        }, 1000);
      }
      
      if (workData.storySkeleton && phase === 1) {
        phase = 2;
        console.log(`\n[${elapsed}s] 🎉 阶段1完成：故事骨架已生成`);
        console.log(`[${elapsed}s] 🚀 进入阶段2：生成改编策略`);
        setTimeout(() => {
          socket.emit("chat", { 
            content: "故事骨架已生成，请继续生成改编策略。调用get_planData获取故事骨架，然后调用run_sub_agent_adaptationStrategy让编剧生成改编策略，最后调用run_supervision_agent让编辑进行审核。" 
          });
        }, 2000);
      }
      
      if (workData.adaptationStrategy && phase === 2) {
        phase = 3;
        console.log(`\n[${elapsed}s] 🎉 阶段2完成：改编策略已生成`);
        console.log(`[${elapsed}s] 🚀 进入阶段3：生成剧本`);
        setTimeout(() => {
          socket.emit("chat", { 
            content: "改编策略已生成，请继续生成剧本。调用get_planData获取故事骨架和改编策略，然后调用run_sub_agent_script让编剧生成剧本。" 
          });
        }, 2000);
      }
    }
  });

  socket.on("connect", async () => {
    console.log("✅ Socket 连接成功");
    console.log("\n" + "=".repeat(60));
    console.log("🚀 阶段1：生成故事骨架");
    console.log("=".repeat(60));
    
    socket.emit("chat", {
      content: "请生成故事骨架。调用get_novel_events获取第1章的事件，然后调用run_sub_agent_storySkeleton让编剧生成故事骨架，最后调用run_supervision_agent让编辑进行审核。",
    });
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  const checkInterval = setInterval(() => {
    const elapsed = (Date.now() - lastResponseTime) / 1000;
    if (elapsed > 180) {
      console.log(`\n⏰ ${elapsed.toFixed(0)}秒无响应，检查最终状态...`);
      printWorkData("最终状态");
      clearInterval(checkInterval);
      socket.disconnect();
      process.exit(0);
    } else {
      console.log(`   ⏳ 等待中... (${elapsed.toFixed(0)}秒无新消息)`);
    }
  }, 15000);
}

main();
