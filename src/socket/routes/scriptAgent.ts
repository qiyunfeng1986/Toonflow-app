import jwt from "jsonwebtoken";
import u from "@/utils";
import { Namespace, Socket } from "socket.io";
import * as agent from "@/agents/scriptAgent/index";
import ResTool from "@/socket/resTool";

async function verifyToken(rawToken: string): Promise<Boolean> {
  const setting = await u.db("o_setting").where("key", "tokenKey").select("value").first();
  if (!setting) return false;
  const { value: tokenKey } = setting;
  if (!rawToken) return false;
  const token = rawToken.replace("Bearer ", "");
  try {
    jwt.verify(token, tokenKey as string);
    return true;
  } catch (err) {
    return false;
  }
}

export default (nsp: Namespace) => {
  nsp.on("connection", async (socket: Socket) => {
    const token = socket.handshake.auth.token;
    if (!token || !(await verifyToken(token))) {
      console.log("[scriptAgent] 连接失败，token无效");
      socket.disconnect();
      return;
    }
    const isolationKey = socket.handshake.auth.isolationKey;
    if (!isolationKey) {
      console.log("[scriptAgent] 连接失败，缺少 isolationKey");
      socket.disconnect();
      return;
    }

    console.log("[scriptAgent] 已连接:", socket.id);

    const resTool = new ResTool(socket, {
      projectId: socket.handshake.auth.projectId,
    });
    let abortController: AbortController | null = null;

    const thinkConfig: agent.AgentContext["thinkConfig"] = {
      think: false,
      thinlLevel: 0,
    };

    socket.on("chat", async (data: { content: string }) => {
      const { content } = data;
      abortController?.abort();
      abortController = new AbortController();
      const currentController = abortController;

      const msg = resTool.newMessage("assistant", "统筹");
      const ctx: agent.AgentContext = {
        socket,
        isolationKey,
        text: content,
        userMessageTime: new Date(msg.datetime).getTime() - 1,
        abortSignal: currentController.signal,
        resTool,
        msg,
        thinkConfig,
      };

      try {
        await agent.runDecisionAI(ctx);
      } catch (err: any) {
        if (err.name !== "AbortError" && !currentController.signal.aborted) {
          console.error("[scriptAgent] chat error:", u.error(err).message);
          msg.error(u.error(err).message)
        }
      } finally {
        if (abortController === currentController) {
          abortController = null;
        }
      }
    });

    socket.on("updateThinkConfig", (data: { think: boolean; thinlLevel: 0 | 1 | 2 | 3 }) => {
      thinkConfig.think = data.think;
      thinkConfig.thinlLevel = data.thinlLevel;
      console.log("[scriptAgent] 更新思考配置:", thinkConfig);
    });

    socket.on("stop", () => {
      abortController?.abort();
      abortController = null;
    });

    socket.on("getPlanData", async (data: { key: string }, callback) => {
      const projectId = resTool.data.projectId as number;
      const { key } = data;
      
      try {
        const row = await u.db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
        let workData: any = {};
        
        if (!row) {
          workData = {
            storySkeleton: "",
            adaptationStrategy: "",
          };
          await u.db("o_agentWorkData").insert({
            projectId,
            key: "scriptAgent",
            data: JSON.stringify(workData),
          });
        } else {
          workData = JSON.parse(row.data ?? "{}");
        }
        
        if (key === "script") {
          const scripts = await u.db("o_script").where({ projectId }).select("id", "name", "content");
          workData.script = scripts;
        }
        
        callback?.({ success: true, data: workData, [key]: workData[key] ?? "" });
      } catch (err: any) {
        console.error("[scriptAgent] getPlanData error:", err.message);
        callback?.({ success: false, error: err.message });
      }
    });

    socket.on("setPlanData", async (data: { key: string; value: string }, callback) => {
      const projectId = resTool.data.projectId as number;
      const { key, value } = data;
      
      try {
        let row = await u.db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
        let workData: any;
        
        if (!row) {
          workData = {
            storySkeleton: "",
            adaptationStrategy: "",
          };
          workData[key] = value;
          await u.db("o_agentWorkData").insert({
            projectId,
            key: "scriptAgent",
            data: JSON.stringify(workData),
          });
        } else {
          workData = JSON.parse(row.data ?? "{}");
          workData[key] = value;
          await u.db("o_agentWorkData")
            .where({ id: row.id })
            .update({ data: JSON.stringify(workData) });
        }
        
        callback?.({ success: true });
      } catch (err: any) {
        console.error("[scriptAgent] setPlanData error:", err.message);
        callback?.({ success: false, error: err.message });
      }
    });
  });
  nsp.on("disconnect", (socket: Socket) => {
    console.log("[scriptAgent] 已断开连接:", socket.id);
  });
};
