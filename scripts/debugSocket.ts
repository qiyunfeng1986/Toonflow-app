import { io } from "socket.io-client";
import Database from "better-sqlite3";
import path from "path";

const SERVER_URL = "http://127.0.0.1:10588";
const PROJECT_ID = 1782322991;

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

async function main() {
  const token = await getToken();
  console.log("✅ Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "debug-test",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  socket.onAny((eventName, ...args) => {
    console.log(`\n📡 事件: ${eventName}`);
    console.log("   数据:", JSON.stringify(args[0]).substring(0, 300));
  });

  socket.on("connect", async () => {
    console.log("✅ 连接成功");
    
    setTimeout(() => {
      console.log("\n🚀 发送 chat 消息...");
      socket.emit("chat", {
        content: "你好，调用get_planData工具获取storySkeleton数据",
      });
    }, 2000);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.log("\n⏰ 超时，断开连接");
    socket.disconnect();
    process.exit(0);
  }, 60000);
}

main();
