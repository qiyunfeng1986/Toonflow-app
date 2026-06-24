import { io, Socket } from "socket.io-client";
import jwt from "jsonwebtoken";
import knex from "knex";
import path from "path";
import fs from "fs";

const SERVER_URL = "http://localhost:10588";
const DB_PATH = path.join(__dirname, "..", "data", "toonflow.db");

interface ScriptAgentClientOptions {
  serverUrl?: string;
  projectId: number;
  isolationKey: string;
}

class ScriptAgentClient {
  private socket: Socket | null = null;
  private projectId: number;
  private isolationKey: string;
  private serverUrl: string;
  private messages: Array<{ id: string; role: string; name?: string; content: string }> = [];
  private waitForMessage: Promise<void> | null = null;

  constructor(options: ScriptAgentClientOptions) {
    this.projectId = options.projectId;
    this.isolationKey = options.isolationKey;
    this.serverUrl = options.serverUrl || SERVER_URL;
  }

  async connect(): Promise<void> {
    const token = await this.getToken();

    return new Promise((resolve, reject) => {
      this.socket = io(`${this.serverUrl}/api/socket/scriptAgent`, {
        auth: {
          token: `Bearer ${token}`,
          isolationKey: this.isolationKey,
          projectId: this.projectId,
        },
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        console.log("[ScriptAgent] 已连接");
        this.setupEventListeners();
        resolve();
      });

      this.socket.on("connect_error", (error) => {
        console.error("[ScriptAgent] 连接失败:", error.message);
        reject(error);
      });

      this.socket.on("disconnect", () => {
        console.log("[ScriptAgent] 已断开连接");
      });
    });
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("message", (msg: any) => {
      console.log(`\n[新消息] ${msg.role}${msg.name ? ` (${msg.name})` : ""}`);
      this.messages.push({
        id: msg.id,
        role: msg.role,
        name: msg.name,
        content: "",
      });
    });

    this.socket.on("content:add", (data: any) => {
      const msg = this.messages.find((m) => m.id === data.messageId);
      if (msg) {
        if (data.content.type === "text") {
          process.stdout.write(data.content.data || "");
        }
      }
    });

    this.socket.on("content:update", (data: any) => {
      if (data.type === "text" && data.strategy === "append") {
        process.stdout.write(data.data || "");
      } else if (data.type === "thinking") {
        // 思考过程
      }
    });

    this.socket.on("message:update", (data: any) => {
      if (data.status === "complete") {
        console.log("\n[消息完成]");
      } else if (data.status === "error") {
        console.error("\n[消息错误]", data.ext?.error);
      }
    });
  }

  async getToken(): Promise<string> {
    const db = knex({
      client: "better-sqlite3",
      connection: { filename: DB_PATH },
      useNullAsDefault: true,
    });

    try {
      const setting = await db("o_setting").where("key", "tokenKey").select("value").first();
      const tokenKey = setting?.value || "default-secret-key";
      const token = jwt.sign({ userId: 1 }, tokenKey, { expiresIn: "7d" });
      return token;
    } finally {
      await db.destroy();
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.socket || !this.socket.connected) {
      throw new Error("未连接到 ScriptAgent");
    }

    console.log(`\n[发送消息] ${content}\n`);
    this.socket.emit("chat", { content });

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async updateThinkConfig(think: boolean, thinkLevel: 0 | 1 | 2 | 3 = 0): Promise<void> {
    if (!this.socket) return;
    this.socket.emit("updateThinkConfig", { think, thinlLevel: thinkLevel });
    console.log(`[配置更新] think=${think}, level=${thinkLevel}`);
  }

  stop(): void {
    if (this.socket) {
      this.socket.emit("stop");
      console.log("[已停止]");
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

async function initDemoProject(): Promise<number> {
  const db = knex({
    client: "better-sqlite3",
    connection: { filename: DB_PATH },
    useNullAsDefault: true,
  });

  try {
    const existingProject = await db("o_project").where("name", "Demo项目").first();
    if (existingProject) {
      console.log(`[项目] 已存在 Demo 项目 ID: ${existingProject.id}`);
      return existingProject.id;
    }

    const [projectId] = await db("o_project").insert({
      name: "Demo项目",
      intro: "这是一个用于演示 scriptAgent 的测试项目",
      type: "甜宠类",
      artStyle: "2D_flat_design",
      videoRatio: "9:16",
      mode: "scriptAgent",
      createTime: Date.now(),
      userId: 1,
    });

    console.log(`[项目] 已创建 Demo 项目 ID: ${projectId}`);

    const sampleNovel = [
      {
        chapterIndex: 1,
        reel: "第一卷",
        chapter: "穿越重生",
        chapterData: `苏晚卿睁开眼睛，发现自己躺在一张古朴的雕花大床上。
头痛欲裂，无数陌生的记忆涌入脑海——她竟然穿越了！
前世她是21世纪的金牌律师，一场车祸让她来到这个架空的古代世界。
原主也叫苏晚卿，是丞相府的嫡女，却因为懦弱无能被人欺负。
"小姐，您醒了？"一个青衣丫鬟走了进来，脸上满是担忧。
苏晚卿迅速整理好情绪，眼中闪过一丝精光。
既然重活一世，她绝不再任人宰割！`,
        event: "苏晚卿穿越到古代，发现自己成为丞相府嫡女，决定不再任人宰割",
        eventState: 1,
      },
      {
        chapterIndex: 2,
        reel: "第一卷",
        chapter: "初次交锋",
        chapterData: `第二天一早，庶妹苏婉儿就来挑衅。
"姐姐，你身子刚好，怎么不多歇歇？"苏婉儿假惺惺地说，眼底却藏着得意。
苏晚卿冷冷一笑，前世见过的阴谋诡计多了去了。
"妹妹倒是来得早，是来看我死了没吗？"苏晚卿一语道破。
苏婉儿脸色一变，没想到一向懦弱的姐姐居然敢这么说话。
"你...你怎么能这么说我！"苏婉儿开始装可怜。
苏晚卿根本不吃这一套，直接起身："没事就滚，别碍眼。"
苏婉儿又气又惊，只能恨恨地离开。
苏晚卿知道，这只是开始。在这个深宅大院里，她必须步步为营。`,
        event: "庶妹苏婉儿前来挑衅，被苏晚卿强硬怼回，苏婉儿恨恨离去",
        eventState: 1,
      },
      {
        chapterIndex: 3,
        reel: "第一卷",
        chapter: "宫廷宴会",
        chapterData: `三日后，皇后设宴，文武百官携家眷入宫。
苏晚卿一身淡紫色长裙，气质脱俗，引得众人侧目。
宴会上，太子萧景琰也在，他是原主的未婚夫，却一直看不起原主。
苏婉儿故意设计，想让苏晚卿在宴会上出丑。
她假装不小心将酒洒在苏晚卿裙子上，想让她当众难堪。
谁知苏晚卿早有防备，侧身一躲，反而让苏婉儿自己摔了一跤。
"哎呀，妹妹怎么这么不小心？"苏晚卿故作惊讶。
众人的目光都聚集过来，苏婉儿脸涨得通红。
太子萧景琰皱了皱眉，第一次认真打量起苏晚卿。
这个女人，好像和以前不一样了。`,
        event: "宫廷宴会上苏婉儿设计陷害苏晚卿反自食其果，太子萧景琰开始注意苏晚卿",
        eventState: 1,
      },
      {
        chapterIndex: 4,
        reel: "第一卷",
        chapter: "皇帝赐婚",
        chapterData: `宴会结束后不久，皇帝下了一道圣旨——赐婚苏晚卿与太子萧景琰。
消息传遍整个京城，所有人都惊呆了。
谁都知道太子看不起苏家嫡女，这门亲事怎么会成？
苏晚卿接到圣旨时，也是一愣。
她本想找机会退婚，没想到皇帝反而赐婚了。
"小姐，这可怎么办啊？"丫鬟小翠急得团团转。
苏晚卿冷静下来："慌什么？兵来将挡，水来土掩。"
她倒要看看，这位太子殿下到底是何方神圣。
而东宫那边，萧景琰捏着圣旨，眉头紧锁。
他本就不想娶那个懦弱的苏家嫡女，现在倒好，皇帝直接赐婚了。
"苏晚卿..."萧景琰低声念着这个名字，眼中闪过复杂的神色。`,
        event: "皇帝赐婚苏晚卿与太子萧景琰，两人各怀心思",
        eventState: 1,
      },
      {
        chapterIndex: 5,
        reel: "第一卷",
        chapter: "太子来访",
        chapterData: `赐婚后第三天，太子萧景琰亲自来到丞相府。
他本想直接退婚，却在见到苏晚卿的那一刻改变了主意。
眼前的女子，一袭白衣，眉眼清冷，完全不是传闻中懦弱无能的样子。
"太子殿下大驾光临，有失远迎。"苏晚卿微微行礼，不卑不亢。
萧景琰盯着她看了许久："你和传闻中不一样。"
"传闻？什么传闻？说我懦弱无能吗？"苏晚卿轻笑。
她的坦然反而让萧景琰不知如何应对。
两人交谈了一个时辰，萧景琰发现苏晚卿不仅不笨，反而聪慧过人。
"这门婚事，你怎么看？"萧景琰突然问。
苏晚卿抬眸："殿下若想退婚，我配合。但若不退...我也不是任人欺负的。"
萧景琰深深地看了她一眼："好，那就不退了。"`,
        event: "太子萧景琰来访想退婚，却被苏晚卿的聪慧吸引，决定不退婚",
        eventState: 1,
      },
    ];

    for (const chapter of sampleNovel) {
      await db("o_novel").insert({
        ...chapter,
        projectId,
        createTime: Date.now(),
      });
    }

    console.log(`[小说] 已插入 ${sampleNovel.length} 章示例小说`);

    return projectId;
  } finally {
    await db.destroy();
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Toonflow ScriptAgent 演示脚本");
  console.log("=".repeat(60));

  try {
    const projectId = await initDemoProject();
    const isolationKey = `demo-${Date.now()}`;

    const client = new ScriptAgentClient({
      projectId,
      isolationKey,
    });

    console.log("\n正在连接 ScriptAgent...");
    await client.connect();

    console.log("\n" + "=".repeat(60));
    console.log("步骤 1: 启动项目初始化对话");
    console.log("=".repeat(60));

    await client.sendMessage("你好，我想开始改编一部小说");

    console.log("\n" + "=".repeat(60));
    console.log("提示: 以上是 ScriptAgent 的初始响应");
    console.log("你可以继续通过 sendMessage 发送消息进行对话");
    console.log("=".repeat(60));

    await new Promise((resolve) => setTimeout(resolve, 5000));

    client.disconnect();
    console.log("\n演示完成，连接已断开");
  } catch (error: any) {
    console.error("\n[错误]", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default ScriptAgentClient;
