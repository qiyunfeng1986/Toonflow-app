/**
 * 大排档武打视频生成脚本
 * Agnes AI · agnes-video-v2.0
 * 用 curl 处理请求（自动走代理）
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 配置 ====================
const API_KEY = 'sk-A1DFRt7posOIFToIH7EDxgTpimUiEtGYFkPsdZvV5DmnChcs';
const BASE_URL = 'https://apihub.agnes-ai.com/v1';
const SUBMIT_URL = `${BASE_URL}/video/generations`;

// 大排档武打场景的 prompt
const VIDEO_PROMPT = 'Two people at a food stall having an intense argument, one person grabs a chair and swings it, the other person dodges quickly, dramatic tension, cinematic night scene, warm amber lights, rainy atmosphere, slow motion action, 动作片风格';

/**
 * 用 curl 发送 HTTP 请求（自动走代理）
 */
function curlRequest(method, url, body = null) {
  const args = ['-s', '-X', method];

  if (body) {
    args.push('-H', 'Content-Type: application/json');
    // 用 process.stdout.write 写入 JSON 到临时文件再传给 curl
    const bodyFile = `/tmp/curl_body_${Date.now()}.json`;
    fs.writeFileSync(bodyFile, JSON.stringify(body));
    args.push('--data-binary', `@${bodyFile}`);
  }

  args.push('-H', `Authorization: Bearer ${API_KEY}`);
  args.push(url);

  try {
    const output = execSync(`curl ${args.join(' ')}`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    return JSON.parse(output);
  } catch (e) {
    const output = e.stdout || '';
    try {
      return JSON.parse(output.trim());
    } catch {
      throw new Error(`请求失败: ${e.message}，输出: ${output.slice(0, 300)}`);
    }
  }
}

/**
 * 下载文件
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? 'curl' : 'curl';

    // curl 下载，不需要认证头
    execSync(`curl -sL -o '${destPath}' '${url}'`, {
      encoding: 'utf8',
      timeout: 120000,
    });
    resolve();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function pollVideo(taskId, maxWaitMs = 600000) {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    const pollUrl = `${SUBMIT_URL}/${taskId}`;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [${attempts}] 轮询中...（已等待 ${elapsedSec} 秒）`);

    try {
      const d = curlRequest('GET', pollUrl);

      const rawStatus = d?.data?.status || d?.status || '';
      const status = String(rawStatus).toLowerCase();
      const progress = d?.data?.progress || d?.progress || '?';

      if (status === 'completed' || status === 'success') {
        // 优先用 CDN 直链，其次用 API 内容接口
        const videoUrl =
          d?.data?.remixed_from_video_id ||
          d?.data?.url ||
          d?.result_url ||
          d?.url;
        console.log(`\n✅ 视频生成成功！`);
        return { url: videoUrl, id: d?.data?.id || taskId };
      }

      if (status === 'failed' || status === 'error') {
        const errMsg = d?.fail_reason || d?.error?.message || JSON.stringify(d).slice(0, 200);
        throw new Error(`视频生成失败: ${errMsg}`);
      }

      console.log(`    状态: ${status}，进度: ${progress}%，等待 15 秒...`);
      await sleep(15000);
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('ECONNRESET') || e.message.includes('ETIMEDOUT')) {
        console.log(`    网络抖动，重试...`);
        await sleep(5000);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`轮询超时（${maxWaitMs / 1000}秒）`);
}

async function main() {
  console.log('========================================');
  console.log('   大排档 · 雨夜对决 视频生成器');
  console.log('   Agnes AI · agnes-video-v2.0');
  console.log('========================================\n');

  // Step 1: 提交视频生成任务
  console.log('📤 提交视频生成任务...');
  console.log(`📝 Prompt: ${VIDEO_PROMPT}\n`);

  const body = {
    model: 'agnes-video-v2.0',
    prompt: VIDEO_PROMPT,
  };

  const submitRes = curlRequest('POST', SUBMIT_URL, body);
  console.log(`📦 响应: ${JSON.stringify(submitRes).slice(0, 500)}\n`);

  // 提取 taskId
  const taskId = submitRes?.task_id || submitRes?.id || submitRes?.data?.task_id;
  if (!taskId) {
    const errMsg = submitRes?.error?.message || submitRes?.message || JSON.stringify(submitRes).slice(0, 300);
    throw new Error('未获取到任务ID！响应: ' + errMsg);
  }

  console.log(`🆔 任务ID: ${taskId}`);
  console.log(`⏳ 预计等待 1-3 分钟（视频生成中...）\n`);

  // Step 2: 轮询结果
  const result = await pollVideo(taskId);
  console.log(`\n🔗 视频地址: ${result.url}\n`);

  // Step 3: 下载视频
  console.log('⬇️  下载视频文件...');
  const outPath = path.join(__dirname, 'fight-video.mp4');
  await downloadFile(result.url, outPath);

  const size = fs.statSync(outPath).size;
  console.log(`\n========================================`);
  console.log(`✅ 视频生成完成！`);
  console.log(`📁 保存路径: ${outPath}`);
  console.log(`📦 文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`🔗 视频地址: ${result.url}`);
  console.log(`========================================`);
}

main().catch(err => {
  console.error('\n❌ 错误:', err.message || String(err));
  process.exit(1);
});
