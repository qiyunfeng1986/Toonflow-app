import { io } from "socket.io-client";

const SERVER_URL = "http://127.0.0.1:10588";
const TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwiaWF0IjoxNzgyMzIwMjM4LCJleHAiOjE3OTc4NzIyMzh9.9KXuyjLUCxxkEPyDde_BqzfEoi_7KWtMoUfyZGIOx7k";

async function testScriptAgent() {
  console.log("正在连接 ScriptAgent WebSocket...");
  
  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: TOKEN,
      isolationKey: "test-connection",
      projectId: 0,
    },
    transports: ["websocket"],
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error("连接超时");
      socket.disconnect();
      reject(new Error("连接超时"));
    }, 10000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log("✅ ScriptAgent WebSocket 连接成功！");
      console.log("   Socket ID:", socket.id);
      
      setTimeout(() => {
        socket.disconnect();
        console.log("✅ 测试完成，连接已断开");
        resolve();
      }, 1000);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      console.error("❌ 连接失败:", error.message);
      reject(error);
    });

    socket.on("disconnect", () => {
      console.log("连接已断开");
    });
  });
}

testScriptAgent()
  .then(() => {
    console.log("\n🎉 所有测试通过！");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ 测试失败:", err.message);
    process.exit(1);
  });
