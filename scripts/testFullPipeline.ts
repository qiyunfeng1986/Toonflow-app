import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import * as fs from "fs";

const TOKEN_KEY = "e7cfe953";
const PROJECT_ID = 1782373002335;
const ISOLATION_KEY = "test-pipeline-full-v4";

async function main() {
  console.log("生成 JWT token...");
  const token = jwt.sign({ userId: 1, username: "test" }, TOKEN_KEY);

  console.log("连接到 scriptAgent 命名空间...");
  
  const socket = io("http://127.0.0.1:10588/api/socket/scriptAgent", {
    transports: ["websocket"],
    auth: {
      token: `Bearer ${token}`,
      isolationKey: ISOLATION_KEY,
      projectId: PROJECT_ID,
    },
  });

  let currentText = "";
  let messageCount = 0;
  let stage = 0; // 0: 初始化, 1: 故事骨架, 2: 改编策略, 3: 剧本生成

  socket.on("connect", () => {
    console.log("✅ 已连接");
  });

  socket.on("message", (data) => {
    messageCount++;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📨 消息 #${messageCount} | ${data.role} | ${data.name || ""}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    currentText = "";
  });

  socket.on("content:update", (data) => {
    if (data.type === "text" && data.strategy === "append" && data.data) {
      process.stdout.write(data.data);
      currentText += data.data;
    }
  });

  socket.on("message:update", (data) => {
    if (data.status === "complete") {
      console.log("\n✅ 消息完成");
      
      // 自动回复逻辑
      setTimeout(() => {
        if (
          (currentText.includes("集数") && currentText.includes("单集时长")) ||
          (currentText.includes("计划拆分为几集") && currentText.includes("每集大约几分钟"))
        ) {
          // 阶段0: 回复项目参数
          console.log("\n🤖 自动回复: 项目参数");
          stage = 1;
          socket.emit("chat", { 
            content: "3集，每集3分钟，覆盖第1章，竖屏9:16，仙侠穿越风格，前2集免费第3集付费" 
          });
        } else if (currentText.includes("审核") && currentText.includes("是否进入下一阶段")) {
          if (stage === 1) {
            // 故事骨架完成，进入改编策略
            console.log("\n🤖 自动回复: 进入改编策略阶段");
            stage = 2;
            socket.emit("chat", { content: "通过，进入改编策略阶段" });
          } else if (stage === 2) {
            // 改编策略完成，进入剧本生成
            console.log("\n🤖 自动回复: 进入剧本生成阶段");
            stage = 3;
            socket.emit("chat", { content: "通过，生成第1集剧本" });
          }
        }
      }, 1000);
    } else if (data.status === "error") {
      console.log("\n❌ 错误:", data.ext?.error);
    }
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("连接超时")), 10000);
  });

  console.log("\n🚀 启动完整流水线测试...\n");
  socket.emit("chat", { content: "生成故事骨架" });

  // 等待10分钟
  await new Promise(resolve => setTimeout(resolve, 600000));

  console.log("\n\n⏰ 测试结束，断开连接");
  socket.disconnect();
}

main().catch(console.error);
