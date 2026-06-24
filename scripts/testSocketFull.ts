import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import * as fs from "fs";

const TOKEN_KEY = "2f35520d";
const PROJECT_ID = 1782322991;
const ISOLATION_KEY = "test-pipeline-full";

async function main() {
  console.log("生成 JWT token...");
  const token = jwt.sign({ userId: 1, username: "test" }, TOKEN_KEY);
  console.log("Token:", token.substring(0, 20) + "...");

  console.log("\n连接到 scriptAgent 命名空间...");
  
  const socket = io("http://127.0.0.1:10588/api/socket/scriptAgent", {
    transports: ["websocket"],
    auth: {
      token: `Bearer ${token}`,
      isolationKey: ISOLATION_KEY,
      projectId: PROJECT_ID,
    },
  });

  let fullText = "";
  let messageCount = 0;

  socket.on("connect", () => {
    console.log("✅ 已连接，socket id:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ 断开连接");
  });

  socket.on("connect_error", (err) => {
    console.log("❌ 连接错误:", err.message);
  });

  socket.on("message", (data) => {
    messageCount++;
    console.log(`\n📨 [消息 #${messageCount}]`, data.id, data.role, data.name || "");
    fullText = "";
  });

  socket.on("content:add", (data) => {
    // console.log("📝 [内容添加]", data.content.type);
  });

  socket.on("content:update", (data) => {
    if (data.type === "text" && data.strategy === "append" && data.data) {
      process.stdout.write(data.data);
      fullText += data.data;
    }
  });

  socket.on("message:update", (data) => {
    if (data.status === "error") {
      console.log("\n❌ [错误]", data.ext?.error);
    } else if (data.status === "complete") {
      console.log("\n✅ [消息完成]");
      
      // 自动回复逻辑
      if (fullText.includes("计划拆分为几集") && fullText.includes("每集大约几分钟")) {
        console.log("\n🤖 自动回复项目参数...");
        setTimeout(() => {
          socket.emit("chat", { 
            content: "3集，每集3分钟，覆盖第1章，竖屏9:16，仙侠穿越风格，前2集免费第3集付费" 
          });
        }, 1000);
      }
    }
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("连接超时")), 10000);
  });

  console.log("\n发送 chat 事件（生成故事骨架）...");
  socket.emit("chat", { content: "生成故事骨架" });

  console.log("\n等待 300 秒...");
  await new Promise(resolve => setTimeout(resolve, 300000));

  console.log("\n超时，断开连接");
  socket.disconnect();
}

main().catch(console.error);
