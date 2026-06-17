#!/usr/bin/env python3
import requests
import time
import json
import subprocess
import os

API_KEY = "sk-A1DFRt7posOIFToIH7EDxgTpimUiEtGYFkPsdZvV5DmnChcs"
API_URL = "https://apihub.agnes-ai.com/v1/video/generations"

# ================= 视频任务列表 =================
tasks = [
    {
        "key": "s1_city",
        "label": "镜号1-a · 汴京紫月城景",
        "prompt": """epic cinematic establishing shot of ancient Chinese city of Bianjing at night, panoramic top-down bird eye view, traditional Chinese architecture with upturned eaves and tile roofs, a large luminous full moon at top center surrounded by dark purple-black halo ring, deep purple-red storm clouds swirling slowly, countless tiny warm orange candle lights dotting the city rooftops, yellow dust particles drifting horizontally across the sky, copper bells hanging from roof corners swaying, low saturation desaturated purple color grading, heavy oppressive atmosphere, film grain texture, widescreen, static camera, epic and mysterious mood, film cinematography"""
    },
    {
        "key": "s1_moon",
        "label": "镜号1-b · 紫月光晕特写",
        "prompt": """cinematic close up of a large luminous full moon against swirling dark purple storm clouds, pale purple light radiating outward from the moon in concentric halo rings, wispy black clouds flowing horizontally across the face of the moon, subtle stars visible in gaps, deep dark purple-blue sky background, low saturation color palette, no overexposure highlights, film grain texture, slow cloud motion, mysterious and ominous atmosphere, cinematic frame"""
    },
    {
        "key": "s2_court",
        "label": "镜号2-a · 开封府公堂全景推镜",
        "prompt": """ancient Chinese Kaifeng court hall interior, cinematic wide shot, dozens of red candles with warm golden flames flickering gently on both sides and background, ornate wooden beams with traditional red lacquer and gold painting, Bao Zheng the legendary upright judge with dark complexion and long black beard sits solemnly in carved wooden chair at center wearing dark official robes with subtle gold embroidery, crescent moon mark on forehead glowing faintly, several officials and guards stand motionless at attention on both sides wearing traditional Song Dynasty robes, dark purple light leaking through doorway in background, warm candlelight versus cold purple contrast lighting, depth of field, film grain, slow cinematic dolly push in camera motion, widescreen, epic dramatic atmosphere"""
    },
    {
        "key": "s2_bao",
        "label": "镜号2-b · 包拯中近景推镜",
        "prompt": """medium close up cinematic shot of Bao Zheng sitting upright in traditional Kaifeng court, dark complexion with long flowing black beard, wearing traditional dark Song Dynasty official robes with gold embroidered collar, face illuminated by warm candlelight from side, crescent moon birthmark on forehead with faint pale white glow, eyes staring forward with solemn and determined expression, candles flickering in background creating moving shadows on carved red wooden pillars and beams, slow gentle dolly push-in camera motion, warm amber and deep purple color contrast lighting, shallow depth of field, film grain, realistic skin texture, natural fabric folds, widescreen, dramatic and epic mood"""
    }
]

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

# ================= 第一步：提交所有任务 =================
print("=" * 60)
print("  🎬 包拯 · 汴京异象 - 视频生成任务")
print("=" * 60)
print()

task_ids = {}
for task in tasks:
    print(f"📹 {task['label']}...")
    payload = {"model": "agnes-video-v2.0", "prompt": task["prompt"]}
    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=30)
        data = resp.json()
        tid = data.get("task_id", "")
        if tid:
            task_ids[task["key"]] = tid
            print(f"   ✅ 已提交: {tid}")
        else:
            print(f"   ⚠️  响应异常: {json.dumps(data, ensure_ascii=False)[:150]}")
    except Exception as e:
        print(f"   ❌ 请求失败: {e}")
    print()

# ================= 第二步：轮询等待完成 =================
print("⏳ 开始轮询等待视频生成...")
print()

downloaded_files = []
for task in tasks:
    key = task["key"]
    if key not in task_ids:
        print(f"⚠️  [{task['label']}] 任务ID无效，跳过")
        continue
    
    tid = task_ids[key]
    print(f"📍 {task['label']}")
    
    max_attempts = 20
    for attempt in range(1, max_attempts + 1):
        time.sleep(12)
        try:
            resp = requests.get(f"{API_URL}/{tid}", headers=headers, timeout=30)
            data = resp.json()
        except:
            print(f"   [{attempt}] 请求超时，重试中...")
            continue
        
        # 解析状态 - 尝试不同的路径
        status = "?"
        if isinstance(data, dict):
            if "data" in data and isinstance(data["data"], dict):
                status = data["data"].get("status", "?")
            else:
                status = data.get("status", "?")
        
        if status in ("SUCCESS", "success", "completed"):
            # 提取视频URL
            url = ""
            nested = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
            if isinstance(nested, dict):
                url = nested.get("remixed_from_video_id", "") or nested.get("url", "") or nested.get("result_url", "")
            if not url and isinstance(data.get("data"), str):
                url = data.get("data", "")
            if not url:
                url = data.get("remixed_from_video_id", "") or data.get("url", "")
            
            print(f"   ✅ 生成成功!")
            
            if url:
                print(f"   🔗 URL: {url[:80]}...")
                # 下载
                try:
                    video_resp = requests.get(url, timeout=120, stream=True)
                    video_path = f"/workspace/baozheng_{key}.mp4"
                    with open(video_path, "wb") as f:
                        for chunk in video_resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    size_mb = os.path.getsize(video_path) / (1024 * 1024)
                    print(f"   💾 已保存: baozheng_{key}.mp4 ({size_mb:.2f} MB)")
                    downloaded_files.append(video_path)
                except Exception as e:
                    print(f"   ⚠️  下载失败: {e}")
            else:
                print(f"   ⚠️  无法提取视频URL")
            print()
            break
        
        elif status in ("FAILURE", "failed", "error"):
            print(f"   ❌ 失败，尝试重试一次...")
            # 重试
            try:
                retry_payload = {"model": "agnes-video-v2.0", "prompt": task["prompt"]}
                resp2 = requests.post(API_URL, json=retry_payload, headers=headers, timeout=30)
                data2 = resp2.json()
                new_tid = data2.get("task_id", "")
                if new_tid:
                    tid = new_tid
                    print(f"   🔄 新任务ID: {new_tid}")
                else:
                    print(f"   ❌ 重试失败，放弃")
                    break
            except:
                print(f"   ❌ 重试请求失败，放弃")
                break
        else:
            print(f"   [{attempt}] 状态: {status}")

print()
print("=" * 60)
print("  📊 生成结果:")
print("=" * 60)
for f in downloaded_files:
    size_mb = os.path.getsize(f) / (1024 * 1024)
    print(f"   ✅ {os.path.basename(f)} ({size_mb:.2f} MB)")

# ================= 第三步：拼接完整版 =================
if len(downloaded_files) >= 2:
    print()
    print(f"🎬 拼接 {len(downloaded_files)} 个片段为完整版...")
    
    # 按顺序拼接 - 重新构建顺序
    ordered_files = []
    for key in ["s1_city", "s1_moon", "s2_court", "s2_bao"]:
        path = f"/workspace/baozheng_{key}.mp4"
        if os.path.exists(path):
            ordered_files.append(path)
    
    if ordered_files:
        try:
            cmd = ["ffmpeg", "-y"]
            for f in ordered_files:
                cmd.extend(["-i", f])
            n = len(ordered_files)
            cmd.extend(["-filter_complex", f"concat=n={n}:v=1:a=1[v][a]"])
            cmd.extend(["-map", "[v]", "-map", "[a]"])
            cmd.append("/workspace/baozheng_final.mp4")
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if os.path.exists("/workspace/baozheng_final.mp4"):
                size = os.path.getsize("/workspace/baozheng_final.mp4") / (1024 * 1024)
                print(f"   ✅ 拼接完成: baozheng_final.mp4 ({size:.2f} MB, 约 {5*n} 秒)")
            else:
                print(f"   ⚠️  ffmpeg 拼接失败: {result.stderr[-200:] if result.stderr else '未知'}")
        except Exception as e:
            print(f"   ⚠️  ffmpeg 错误: {e}")
else:
    print(f"   ⚠️  可用片段不足 {len(downloaded_files)} 个，跳过拼接")

print()
print("=" * 60)
print("   🎬 所有视频生成完毕 ✅")
print("=" * 60)
