import os
import base64
import asyncio
from typing import Optional, Any

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MINIMAX_API_URL = "https://api.minimaxi.com"
API_KEY = os.environ.get("MINIMAX_API_KEY", "")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

app = FastAPI(title="MiniMax I2V Demo", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

CAMERA_COMMANDS = [
    "左移", "右移", "左摇", "右摇",
    "推进", "拉远", "上升", "下降",
    "上摇", "下摇", "变焦推近", "变焦拉远",
    "晃动", "跟随", "固定",
]


class VideoTaskResponse(BaseModel):
    task_id: str
    status_code: int
    status_msg: str


class VideoStatusResponse(BaseModel):
    task_id: str
    status: str  # processing / success / failed
    file_id: Optional[str] = None
    video_url: Optional[str] = None
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    if not API_KEY:
        raise HTTPException(status_code=400, detail="MINIMAX_API_KEY 环境变量未设置")
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }


def _sanitize_filename(fname: str) -> str:
    return "".join(c for c in fname if c.isalnum() or c in (".", "_", "-"))[:80] or "file"


async def _download_to_cache(file_id: str) -> str:
    """Download a MiniMax file by id into cache. Returns local path."""
    target = os.path.join(CACHE_DIR, f"{file_id}.mp4")
    if os.path.exists(target) and os.path.getsize(target) > 0:
        return target

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1) get download info
        resp = await client.post(
            f"{MINIMAX_API_URL}/v1/files/retrieve_content",
            headers=_headers(),
            json={"file_id": file_id},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"查询下载链接失败: {resp.text}")
        data = resp.json()
        base_resp = data.get("base_resp", {})
        if base_resp.get("status_code", 0) != 0:
            raise HTTPException(status_code=502, detail=base_resp.get("status_msg", "错误"))
        # the file API returns url / extension_media_list / file_data
        url = (
            data.get("file_url")
            or (data.get("extension_media_list") or [{}])[0].get("url")
            or data.get("file_data", {}).get("url")
        )
        if not url:
            raise HTTPException(status_code=502, detail="未找到视频下载地址")

        # 2) download the file
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            tmp = target + ".part"
            with open(tmp, "wb") as f:
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    f.write(chunk)
        os.replace(tmp, target)
    return target


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/api/config")
async def get_config():
    return {
        "api_key_set": bool(API_KEY),
        "camera_commands": CAMERA_COMMANDS,
        "models": [
            "MiniMax-Hailuo-2.3",
            "MiniMax-Hailuo-2.3-Fast",
            "MiniMax-Hailuo-02",
            "I2V-01-Director",
            "I2V-01-live",
            "I2V-01",
        ],
    }


@app.post("/api/generate")
async def generate_video(
    prompt: str = Form(..., max_length=2000),
    model: str = Form(default="MiniMax-Hailuo-2.3"),
    duration: int = Form(default=6),
    resolution: str = Form(default="768P"),
    prompt_optimizer: bool = Form(default=True),
    fast_pretreatment: bool = Form(default=False),
    aigc_watermark: bool = Form(default=False),
    image: Optional[UploadFile] = File(default=None),
    image_url: Optional[str] = Form(default=None),
):
    if not image and not image_url:
        raise HTTPException(status_code=400, detail="请提供图片或公网图片 URL")

    # build first_frame_image
    if image:
        raw = await image.read()
        if len(raw) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="图片体积超过 20MB 限制")
        mime = image.content_type or "image/jpeg"
        if not mime.startswith("image/"):
            raise HTTPException(status_code=400, detail="上传文件不是图片")
        first_frame_image = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
    else:
        first_frame_image = image_url.strip()

    payload: dict[str, Any] = {
        "model": model,
        "first_frame_image": first_frame_image,
        "prompt": prompt,
        "prompt_optimizer": prompt_optimizer,
        "fast_pretreatment": fast_pretreatment,
        "duration": duration,
        "resolution": resolution,
        "aigc_watermark": aigc_watermark,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{MINIMAX_API_URL}/v1/video_generation",
                headers=_headers(),
                json=payload,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"调用 MiniMax API 异常: {exc}")

    if resp.status_code != 200:
        return JSONResponse(
            status_code=resp.status_code,
            content={"raw": resp.text},
        )

    data = resp.json()
    base_resp = data.get("base_resp", {})
    return {
        "task_id": data.get("task_id", ""),
        "status_code": base_resp.get("status_code", -1),
        "status_msg": base_resp.get("status_msg", ""),
    }


@app.get("/api/tasks/{task_id}")
async def query_task(task_id: str):
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{MINIMAX_API_URL}/v1/video_generation/query",
                headers=_headers(),
                json={"task_id": task_id},
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"查询任务异常: {exc}")

    if resp.status_code != 200:
        return JSONResponse(status_code=resp.status_code, content={"raw": resp.text})

    data = resp.json()
    base_resp = data.get("base_resp", {})
    if base_resp.get("status_code", 0) != 0:
        return JSONResponse(
            status_code=200,
            content={
                "task_id": task_id,
                "status": "failed",
                "file_id": None,
                "video_url": None,
                "message": base_resp.get("status_msg", "任务失败"),
            },
        )

    status = data.get("status", "processing")
    file_id = data.get("file_id")
    video_url = None

    # Try to get a playable URL directly when status == success
    if status == "success" and file_id:
        try:
            url_resp = await client.post(
                f"{MINIMAX_API_URL}/v1/files/retrieve_content",
                headers=_headers(),
                json={"file_id": file_id},
            )
            if url_resp.status_code == 200:
                url_data = url_resp.json()
                br = url_data.get("base_resp", {})
                if br.get("status_code", 0) == 0:
                    video_url = (
                        url_data.get("file_url")
                        or (url_data.get("extension_media_list") or [{}])[0].get("url")
                        or url_data.get("file_data", {}).get("url")
                    )
        except Exception:
            video_url = None

    return {
        "task_id": task_id,
        "status": status,
        "file_id": file_id,
        "video_url": video_url,
        "message": None,
        "raw": data,
    }


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    try:
        path = await _download_to_cache(file_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"下载失败: {exc}")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"{file_id}.mp4",
    )


@app.get("/")
def root():
    index_html = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_html):
        return FileResponse(index_html)
    return {"message": "MiniMax I2V Demo API running. Place static/index.html for UI."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
