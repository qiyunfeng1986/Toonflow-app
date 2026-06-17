/**
 * 大排档武打视频生成脚本
 * 调用 Atlas Cloud Seedance 2.0 文生视频接口
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 配置 ====================
const API_KEY = 'sk-A1DFRt7posOIFToIH7EDxgTpimUiEtGYFkPsdZvV5DmnChcs';
const BASE_URL = 'api.atlascloud.ai';
const VIDEO_PATH = '/api/v1/model/generateVideo';
const POLL_PATH = '/api/v1/model/prediction';

// Seedance 2.0 视频生成 prompt
const VIDEO_PROMPT = `
A cinematic night scene at a bustling Hong Kong-style outdoor food stall (dai pai dong) at night. 
Rain is dripping from the canvas awning. Two men sit opposite each other at a metal folding table, 
amber street light casting dramatic shadows. Suddenly, tension erupts — one man in a grey hoodie 
throws a wild punch, the man in a black jacket dodges and counterattacks with a sweeping kick. 
Metal folding chairs crash and scatter. Beer mugs shatter, spilling amber liquid across the table. 
The hanging incandescent bulb swings wildly. People scream and back away. 
Slow motion, cinematic, dramatic lighting, film grain, martial arts action, 动作片风格.
`.trim();

async function httpRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function pollTask(taskId, timeoutMs = 600000) {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    const pollUrl = `${POLL_PATH}/${taskId}`;
    console.log(`  [${attempts}] 轮询中...`);

    try {
      const res = await httpRequest('GET', pollUrl);
      const status = (res.data?.status || res.data?.state || '').toLowerCase();

      if (['succeeded', 'success', 'done', 'completed'].includes(status)) {
        // 尝试提取视频 URL
        const videoUrl =
          res.data?.url ||
          res.data?.video_url ||
          res.data?.data?.url ||
          res.data?.data?.video_url ||
          res.data?.data?.output?.url ||
          res.data?.data?.outputs?.[0];

        if (videoUrl) {
          console.log(`\n✅ 视频生成成功！`);
          return videoUrl;
        }
        throw new Error('任务成功但未返回视频URL: ' + JSON.stringify(res.data).slice(0, 200));
      }

      if (['failed', 'error', 'cancelled'].includes(status)) {
        const errMsg = res.data?.error?.message || res.data?.message || JSON.stringify(res.data);
        throw new Error('视频生成失败: ' + errMsg);
      }

      // 进行中，等待后继续
      console.log(`    状态: ${status}，等待 8 秒...`);
      await sleep(8000);
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('ETIMEDOUT') || e.message.includes('ECONNRESET')) {
        console.log(`    网络抖动，重试...`);
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`轮询超时（${timeoutMs / 1000}秒）`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    // 处理 data URL
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      fs.writeFileSync(destPath, Buffer.from(base64, 'base64'));
      resolve();
      return;
    }

    // 处理 http/https URL
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('   大排档 · 雨夜对决 视频生成器');
  console.log('   Atlas Cloud · Seedance 2.0');
  console.log('========================================\n');

  // Step 1: 提交视频生成任务
  console.log('📤 提交视频生成任务...');
  console.log(`📝 Prompt: ${VIDEO_PROMPT.slice(0, 80)}...\n`);

  const body = {
    model: 'bytedance/seedance-2.0/text-to-video',
    prompt: VIDEO_PROMPT,
    ratio: '16:9',
    duration: 5,
    resolution: '720p',
    watermark: false,
    generate_audio: false,
  };

  const submitRes = await httpRequest('POST', VIDEO_PATH, body);
  console.log(`📨 服务器响应: HTTP ${submitRes.status}`);
  console.log(`📦 原始数据: ${JSON.stringify(submitRes.data).slice(0, 300)}\n`);

  // 提取 taskId
  const taskId =
    submitRes.data?.id ||
    submitRes.data?.taskId ||
    submitRes.data?.task_id ||
    submitRes.data?.data?.id;

  if (!taskId) {
    // 检查是否有同步返回的视频URL
    const syncUrl = submitRes.data?.url || submitRes.data?.video_url || submitRes.data?.data?.url;
    if (syncUrl) {
      console.log('🔗 同步返回视频URL，直接下载...\n');
      const outPath = path.join(__dirname, 'fight-video.mp4');
      await downloadFile(syncUrl, outPath);
      console.log(`\n✅ 视频已保存: ${outPath}`);
      console.log(`📁 文件大小: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB`);
      return;
    }
    throw new Error('未获取到任务ID！响应: ' + JSON.stringify(submitRes.data).slice(0, 500));
  }

  console.log(`🆔 任务ID: ${taskId}\n`);
  console.log('⏳ 等待视频生成（预计 2-5 分钟）...\n');

  // Step 2: 轮询结果
  const videoUrl = await pollTask(taskId);
  console.log(`\n🔗 视频地址: ${videoUrl}\n`);

  // Step 3: 下载视频
  console.log('⬇️  下载视频文件...');
  const outPath = path.join(__dirname, 'fight-video.mp4');
  await downloadFile(videoUrl, outPath);

  const size = fs.statSync(outPath).size;
  console.log(`\n========================================`);
  console.log(`✅ 视频生成完成！`);
  console.log(`📁 保存路径: ${outPath}`);
  console.log(`📦 文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`🔗 视频地址: ${videoUrl}`);
  console.log(`========================================`);
}

main().catch(err => {
  console.error('\n❌ 错误:', err.message);
  process.exit(1);
});
