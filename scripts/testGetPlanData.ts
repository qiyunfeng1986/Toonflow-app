import { io } from "socket.io-client";

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

async function test() {
  const token = await getToken();
  console.log("Token 获取成功");

  const socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
    auth: {
      token: `Bearer ${token}`,
      isolationKey: "test-getplandata",
      projectId: PROJECT_ID,
    },
    transports: ["websocket"],
  });

  socket.on("connect", async () => {
    console.log("✅ 连接成功");

    console.log("\n📡 测试 getPlanData...");
    socket.emit("getPlanData", { key: "storySkeleton" }, (res: any) => {
      console.log("getPlanData 响应:", JSON.stringify(res, null, 2));
      
      console.log("\n📡 测试 setPlanData...");
      socket.emit("setPlanData", { 
        key: "storySkeleton", 
        value: "测试故事骨架内容" 
      }, (res2: any) => {
        console.log("setPlanData 响应:", JSON.stringify(res2, null, 2));
        
        console.log("\n📡 再次读取 getPlanData 验证...");
        socket.emit("getPlanData", { key: "storySkeleton" }, (res3: any) => {
          console.log("验证结果:", JSON.stringify(res3, null, 2));
          console.log("\n✅ 测试完成");
          socket.disconnect();
          process.exit(0);
        });
      });
    });
  });

  socket.on("connect_error", (err) => {
    console.error("❌ 连接失败:", err.message);
    process.exit(1);
  });
}

test();
