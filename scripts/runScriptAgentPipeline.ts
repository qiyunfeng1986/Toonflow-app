import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://127.0.0.1:10588";
const PROJECT_ID = 1782322991;
const ISOLATION_KEY = "pipeline-demo-001";

interface Message {
  id: string;
  role: string;
  name?: string;
  status: string;
  content: string;
  thinking: string;
}

class ScriptAgentPipeline {
  private socket: Socket | null = null;
  private messages: Map<string, Message> = new Map();
  private currentMessageId: string = "";
  private waitForComplete: ((value: void) => void) | null = null;

  async connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("🔌 正在连接 ScriptAgent...");
      
      this.socket = io(`${SERVER_URL}/api/socket/scriptAgent`, {
        auth: {
          token: `Bearer ${token}`,
          isolationKey: ISOLATION_KEY,
          projectId: PROJECT_ID,
        },
        transports: ["websocket"],
      });

      this.socket.on("connect", () => {
        console.log("✅ ScriptAgent 连接成功！\n");
        this.setupListeners();
        resolve();
      });

      this.socket.on("connect_error", (error) => {
        console.error("❌ 连接失败:", error.message);
        reject(error);
      });

      this.socket.on("disconnect", () => {
        console.log("\n🔌 连接已断开");
      });
    });
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on("message", (msg: any) => {
      this.currentMessageId = msg.id;
      this.messages.set(msg.id, {
        id: msg.id,
        role: msg.role,
        name: msg.name,
        status: msg.status,
        content: "",
        thinking: "",
      });

      const roleLabel = msg.name ? `[${msg.name}]` : `[${msg.role}]`;
      console.log(`\n📩 新消息 ${roleLabel}`);
      console.log("─".repeat(60));
    });

    this.socket.on("content:add", (data: any) => {
      const msg = this.messages.get(data.messageId);
      if (!msg) return;

      if (data.content.type === "text") {
        msg.content += data.content.data || "";
        process.stdout.write(data.content.data || "");
      } else if (data.content.type === "thinking") {
        msg.thinking += data.content.data || "";
      }
    });

    this.socket.on("content:update", (data: any) => {
      const msg = this.messages.get(data.messageId);
      if (!msg) return;

      if (data.type === "text" && data.strategy === "append") {
        msg.content += data.data || "";
        process.stdout.write(data.data || "");
      }
    });

    this.socket.on("message:update", (data: any) => {
      const msg = this.messages.get(data.id);
      if (msg) {
        msg.status = data.status;
      }

      if (data.status === "complete") {
        console.log("\n" + "─".repeat(60));
        console.log("✅ 消息完成\n");
        if (this.waitForComplete) {
          this.waitForComplete();
          this.waitForComplete = null;
        }
      } else if (data.status === "error") {
        console.log("\n❌ 消息错误:", data.ext?.error);
        if (this.waitForComplete) {
          this.waitForComplete();
          this.waitForComplete = null;
        }
      }
    });
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.socket || !this.socket.connected) {
      throw new Error("未连接");
    }

    console.log(`\n👤 发送: ${content}`);
    console.log("─".repeat(60));

    this.socket.emit("chat", { content });

    await new Promise<void>((resolve) => {
      this.waitForComplete = resolve;
      setTimeout(() => {
        if (this.waitForComplete) {
          console.log("\n⏰ 等待超时（600秒），继续检查数据...");
          this.waitForComplete();
          this.waitForComplete = null;
        }
      }, 600000);
    });
  }

  async getPlanData(key: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(null);
      
      this.socket.emit("getPlanData", { key }, (response: any) => {
        resolve(response?.data || null);
      });

      setTimeout(() => resolve(null), 5000);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

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
  console.log("=".repeat(70));
  console.log("🎬 ScriptAgent 完整流水线演示");
  console.log("=".repeat(70));
  console.log(`项目ID: ${PROJECT_ID}`);
  console.log(`隔离键: ${ISOLATION_KEY}`);
  console.log("");

  const token = await getToken();
  const agent = new ScriptAgentPipeline();

  try {
    await agent.connect(token);

    console.log("\n" + "=".repeat(70));
    console.log("📚 阶段 0: 项目初始化对话");
    console.log("=".repeat(70));
    await agent.sendMessage("你好，我想开始改编一部小说。小说名称是《黄大仙修仙传》，类型是仙侠类，目前有1章内容。请你根据小说内容直接推荐最合适的改编配置方案（集数、单集时长、付费策略等），然后直接开始生成故事骨架，不用再问我问题了。");

    await new Promise((r) => setTimeout(r, 2000));

    console.log("\n" + "=".repeat(70));
    console.log("📊 检查故事骨架数据");
    console.log("=".repeat(70));
    const skeleton = await agent.getPlanData("storySkeleton");
    if (skeleton) {
      console.log("✅ 故事骨架已生成");
      console.log(JSON.stringify(skeleton, null, 2).substring(0, 2000));
    } else {
      console.log("⚠️  故事骨架暂未生成（可能还在生成中）");
    }

    console.log("\n" + "=".repeat(70));
    console.log("🎉 第一阶段演示完成！");
    console.log("=".repeat(70));

  } catch (error: any) {
    console.error("\n❌ 错误:", error.message);
  } finally {
    agent.disconnect();
  }
}

main();
