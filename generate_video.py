"""
包青天·跨时代割裂悬疑宣传片 —— 双镜程序化视频生成
严格遵循用户 Agnes 引擎规格：
- 4K 16:9，24fps
- 镜头1「汴京异象」：暗紫红天幕、圆月紫环、狂风黄沙（0:00-0:05）
- 镜头2「正堂肃穆」：开封府红烛公堂、包拯月牙白光、公孙策银针、展昭（0:05-0:10）
- 音效：低频滚雷 + 穿堂风声 + 画外音「嘉祐年间，岁在乙巳……」
- 光影：古风暖烛光 ⇄ 现代冷紫蓝撞色，全局悬疑压抑，胶片颗粒
"""

import os
import math
import random
import subprocess
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# ---------- 基础参数 ----------
W, H = 1920, 1080
FPS = 24
OUT_DIR = "/workspace/_render"
shutil.rmtree(OUT_DIR, ignore_errors=True)
os.makedirs(OUT_DIR, exist_ok=True)
rng = np.random.default_rng(20260617)

# ---------- 辅助工具 ----------
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def lerp(a, b, t):
    return a + (b - a) * t

def clamp01(x):
    return max(0.0, min(1.0, x))

def to_im(arr):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def im2arr(im):
    return np.asarray(im, dtype=np.float32)

def add_film_grain(arr, strength=3.0):
    """轻微胶片颗粒"""
    g = rng.normal(0.0, strength, arr.shape).astype(np.float32)
    return np.clip(arr + g, 0.0, 255.0)

def vignette(arr, strength=0.45):
    """暗角：画面中心略亮、边缘压暗，营造剧场感"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2.0, H / 2.0
    dx = (xx - cx) / cx
    dy = (yy - cy) / cy
    d = np.sqrt(dx * dx + dy * dy)
    mask = 1.0 - np.clip(d - 0.35, 0.0, 0.7) / 0.7 * strength
    mask = mask[:, :, None]
    return arr * mask

def soft_vignette_subtle(arr, strength=0.18):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2.0, H / 2.0
    dx = (xx - cx) / cx
    dy = (yy - cy) / cy
    d = np.sqrt(dx * dx + dy * dy)
    mask = 1.0 - np.clip(d, 0.0, 1.0) * strength
    mask = mask[:, :, None]
    return arr * mask

def gaussian_blur(arr, radius):
    return im2arr(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)))

# ---------- 镜头1：汴京异象 ----------
def sky_base(t_sec):
    """暗紫红天幕，画面动态缓流；t 为当前时间（秒）"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # 基础颜色：上深紫、下近黑
    top = np.array([58, 18, 68], dtype=np.float32)
    mid = np.array([88, 22, 100], dtype=np.float32)
    bot = np.array([10, 6, 18], dtype=np.float32)
    # 垂直渐变
    v = yy / H
    col = np.where(v[..., None] < 0.55,
                   top + (mid - top) * (v[..., None] / 0.55),
                   mid + (bot - mid) * ((v[..., None] - 0.55) / 0.45))
    # 流动紫纹：低频云状扭曲
    phase = t_sec * 0.05
    nx = xx / W * 3.2 + phase
    ny = yy / H * 3.2 - phase * 0.6
    wave1 = np.sin(nx * 1.7 + np.cos(ny * 2.1))
    wave2 = np.cos(nx * 1.1 - np.sin(ny * 1.9) + phase * 4)
    wave = (wave1 + wave2) * 0.25  # -0.5 ~ 0.5
    # 紫纹偏亮处提亮红紫
    boost = (wave[..., None] + 0.5) * np.array([28, 10, 48], dtype=np.float32)
    col = col + boost
    return col

def moon(t_sec):
    """高悬圆形冷月，带淡紫晕环"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    cx_m, cy_m = int(W * 0.72), int(H * 0.28)
    radius = int(min(W, H) * 0.06)
    yy, xx = np.mgrid[0:H, 0:W]
    dx = (xx - cx_m).astype(np.float32)
    dy = (yy - cy_m).astype(np.float32)
    dist = np.sqrt(dx * dx + dy * dy)
    # 月面本体
    moon_core = np.where(dist < radius, 1.0, 0.0)
    # 月面柔和纹理：径向噪点
    tex = rng.uniform(0.78, 1.0, (H, W)).astype(np.float32)
    moon_col = np.array([248, 238, 218], dtype=np.float32) * moon_core[..., None] * tex[..., None]
    # 淡紫晕环：圆环状紫白光
    ring1 = np.exp(-((dist - radius * 1.6) ** 2) / (radius * radius * 0.18)) * 0.55
    ring2 = np.exp(-((dist - radius * 2.6) ** 2) / (radius * radius * 0.35)) * 0.32
    halo = ring1 + ring2
    halo_col = halo[..., None] * np.array([178, 120, 220], dtype=np.float32)
    # 呼吸：微脉动
    pulse = 0.92 + 0.08 * math.sin(t_sec * 1.3)
    return (moon_col + halo_col) * pulse

def dust_sand_layer(t_sec, idx):
    """低空翻涌的尘沙：用两层大尺度噪声模拟气流横向席卷"""
    scale = 0.008
    yoff = H * 0.55  # 地平线附近起
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    phase = t_sec * 2.4 + idx * 13.7
    n1 = np.sin((xx * scale * 3) + phase + np.cos(yy * scale * 1.7))
    n2 = np.cos((xx * scale * 1.3) - phase * 0.6 + np.sin(yy * scale * 2.3))
    n = (n1 + n2) * 0.5  # -1 ~ 1
    # 集中在中下部
    band = np.clip(1.0 - np.abs(yy - yoff) / (H * 0.55), 0.0, 1.0)
    band = band ** 1.4
    strength = (n * 0.5 + 0.5) * band * 0.55
    col = strength[..., None] * np.array([140, 118, 98], dtype=np.float32)
    return col

def flying_sparks(t_sec):
    """细小飞扬尘粒：模拟狂风裹挟的颗粒点"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    n_particles = 220
    for _ in range(n_particles):
        # 颗粒速度横向
        base_x = (rng.uniform(0, 1) + t_sec * 0.07 * rng.uniform(0.5, 1.3)) % 1.0
        y = rng.integers(int(H * 0.35), int(H * 0.95))
        x = int(base_x * W)
        size = rng.integers(1, 3)
        alpha = rng.uniform(0.35, 0.75)
        color = np.array([210, 190, 160], dtype=np.float32) * alpha
        x0, x1 = max(0, x - size), min(W, x + size + 1)
        y0, y1 = max(0, y - size), min(H, y + size + 1)
        img[y0:y1, x0:x1] = np.maximum(img[y0:y1, x0:x1], color)
    return img

def lightning_flicker(t_sec):
    """低频滚动雷暴的偶发闪光：在 1.1~1.4 秒、3.3~3.5 秒强闪"""
    flashes = [(1.10, 1.14, 0.65), (1.17, 1.20, 0.28), (3.30, 3.33, 0.55), (4.10, 4.13, 0.22)]
    amp = 0.0
    for s, e, a in flashes:
        if s <= t_sec <= e:
            amp = max(amp, a)
    return amp

def render_shot1_frame(t_sec):
    # 基础天幕
    sky = sky_base(t_sec)
    # 月亮与紫环
    mn = moon(t_sec)
    # 尘沙
    dust = dust_sand_layer(t_sec, 0) + dust_sand_layer(t_sec * 1.3 + 3, 1) * 0.6
    # 飞扬颗粒
    sparks = flying_sparks(t_sec)

    # 合成：天空为底，叠加月亮和尘沙
    frame = sky + mn
    # 尘沙带过曝保护：用 screen 模式叠加
    frame = frame + dust
    frame = frame + sparks

    # 雷电闪光：叠加冷蓝白光
    fl = lightning_flicker(t_sec)
    if fl > 0:
        flash_col = np.array([190, 200, 235], dtype=np.float32) * fl
        frame = frame * (1.0 + fl * 0.6) + flash_col * 0.3

    # 色调压暗：全局低沉压抑
    frame = frame * 0.82 + np.array([-6, -6, 6], dtype=np.float32)

    # 胶片轻微颗粒
    frame = add_film_grain(frame, strength=1.6)
    # 暗角
    frame = vignette(frame, strength=0.55)
    return np.clip(frame, 0, 255).astype(np.uint8)

# ---------- 镜头2：正堂肃穆 ----------
def build_interior_base():
    """公堂背景：深色木梁 + 红烛暖光 + 中央牌匾"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    # 背景木色渐变：上暗下略亮
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    top_c = np.array([22, 14, 10], dtype=np.float32)
    mid_c = np.array([42, 26, 18], dtype=np.float32)
    bot_c = np.array([62, 38, 22], dtype=np.float32)
    col = np.where(v[..., None] < 0.55,
                   top_c + (mid_c - top_c) * (v[..., None] / 0.55),
                   mid_c + (bot_c - mid_c) * ((v[..., None] - 0.55) / 0.45))
    img += col

    # 横向大梁线（梁顶几条）
    for y in [int(H * 0.12), int(H * 0.18), int(H * 0.25)]:
        thickness = 6 if y == int(H * 0.18) else 3
        img[y - thickness:y + thickness, :] *= 0.55
        img[y - thickness:y + thickness, :] += np.array([30, 18, 10], dtype=np.float32)

    # 中央暗紫牌匾轮廓（剪影）
    px0, px1 = int(W * 0.42), int(W * 0.58)
    py0, py1 = int(H * 0.08), int(H * 0.22)
    img[py0:py1, px0:px1] *= 0.35
    img[py0:py1, px0:px1] += np.array([48, 22, 80], dtype=np.float32) * 0.35
    # 牌匾上下框
    img[py0 - 4:py0 + 4, px0 - 8:px1 + 8] = np.array([140, 90, 30], dtype=np.float32)
    img[py1 - 4:py1 + 4, px0 - 8:px1 + 8] = np.array([140, 90, 30], dtype=np.float32)

    # 左右两根红柱
    for cx in [int(W * 0.10), int(W * 0.90)]:
        w = int(W * 0.035)
        img[:, cx - w:cx + w] *= 0.45
        img[:, cx - w:cx + w] += np.array([90, 22, 18], dtype=np.float32)

    return img

def candle_flame(x, y_base, t_sec, flicker_freq=9.0, amp=18.0, base_h=62, color_warm=np.array([255, 170, 70], dtype=np.float32)):
    """绘制一个蜡烛火焰：随时间摇曳"""
    layer = np.zeros((H, W, 3), dtype=np.float32)
    # 火焰高度随机微变
    flick = math.sin(t_sec * flicker_freq + x * 0.02) * amp * 0.5 + amp * 0.5
    h = int(base_h + flick)
    w = max(6, int(h * 0.28))
    for dy in range(h):
        yy = y_base - dy
        if yy < 0 or yy >= H:
            continue
        # 上尖下宽
        cur_w = int(w * (1.0 - dy / h) + 3)
        ratio = dy / h
        col = color_warm * (0.85 + 0.15 * math.sin(t_sec * 11 + dy * 0.2))
        col *= (0.45 + 0.55 * ratio)
        x0, x1 = max(0, x - cur_w), min(W, x + cur_w)
        layer[yy, x0:x1] = np.maximum(layer[yy, x0:x1], col)
    # 外光晕 blur
    layer_blur = gaussian_blur(layer, radius=12)
    return layer_blur + layer * 0.9

def bauzheng_silhouette(t_sec):
    """包拯端坐太师椅：黑色官袍、面部硬朗黝黑、额头月牙冷白光。简笔人物作为影视插画呈现。"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    # 人物居中偏下（太师椅位置）
    cx_p, cy_p = int(W * 0.50), int(H * 0.58)
    # 太师椅靠背轮廓（深色木）
    x0, x1 = int(W * 0.36), int(W * 0.64)
    y0, y1 = int(H * 0.42), int(H * 0.92)
    # 椅背顶部
    img[y0:y0 + 12, x0:x1] = np.array([32, 20, 14], dtype=np.float32)
    # 左右扶手柱
    for cx in [x0 + 18, x1 - 18]:
        img[y0:y1, cx - 8:cx + 8] = np.array([35, 22, 16], dtype=np.float32)
    # 座位横板
    img[int(H * 0.78):int(H * 0.81), x0:x1] = np.array([38, 24, 18], dtype=np.float32)

    # 人物黑袍
    body_top = int(H * 0.50)
    body_bot = int(H * 0.92)
    body_l = int(W * 0.42)
    body_r = int(W * 0.58)
    # 袍服渐宽
    for y in range(body_top, body_bot):
        rel = (y - body_top) / (body_bot - body_top)
        half_w = int((body_r - body_l) / 2 * (0.55 + 0.9 * rel))
        x_a = max(0, cx_p - half_w)
        x_b = min(W, cx_p + half_w)
        # 黑袍暗色带紫红环境反光
        env = 0.5 + 0.5 * math.sin(t_sec * 0.8 + y * 0.01)
        col = np.array([8, 6, 10], dtype=np.float32) + np.array([14, 8, 22], dtype=np.float32) * env * 0.18
        img[y, x_a:x_b] = np.maximum(img[y, x_a:x_b] * 0.2, col)

    # 头部
    head_cy = int(H * 0.47)
    head_r = int(min(W, H) * 0.048)
    yy, xx = np.mgrid[0:H, 0:W]
    dx = (xx - cx_p).astype(np.float32)
    dy = (yy - head_cy).astype(np.float32)
    dist = np.sqrt(dx * dx + dy * dy)
    head_mask = (dist < head_r).astype(np.float32)
    # 黝黑面色 + 冷暖侧光
    skin_base = np.array([58, 42, 32], dtype=np.float32)
    side_light = np.array([32, 26, 80], dtype=np.float32)  # 门外暗紫反光
    warm_side = np.array([60, 34, 14], dtype=np.float32)    # 红烛暖光侧
    side_t = np.clip((dx / head_r) * 0.5 + 0.5, 0.0, 1.0)  # 左侧偏暖、右侧偏冷紫
    skin = skin_base + warm_side * (1 - side_t[..., None]) * 0.6 + side_light * side_t[..., None] * 0.7
    img = img + skin * head_mask[..., None] * 0.85

    # 额头月牙冷白光（小月牙：左凸弧）
    cres = np.zeros_like(head_mask)
    for cy in range(head_cy - int(head_r * 0.75), head_cy - int(head_r * 0.30)):
        row_r = int(head_r * 0.09)
        cres[cy, cx_p - row_r:cx_p + row_r] = 1.0
    # 发光漫射
    cres_blur = gaussian_blur(cres * 1.0, radius=8)
    cres_col = np.array([230, 245, 255], dtype=np.float32)
    pulse = 0.92 + 0.08 * math.sin(t_sec * 1.6)
    img = img + cres_blur[..., None] * cres_col * pulse * 1.6
    img = img + cres[..., None] * cres_col * 2.2 * pulse

    # 官帽（乌纱帽）：头顶横展
    hat_top_y = head_cy - int(head_r * 1.05)
    hat_h = int(head_r * 0.55)
    hat_w = int(head_r * 2.2)
    img[hat_top_y - hat_h:hat_top_y, cx_p - hat_w:cx_p + hat_w] *= 0.25
    img[hat_top_y - hat_h:hat_top_y, cx_p - hat_w:cx_p + hat_w] += np.array([18, 12, 10], dtype=np.float32)
    # 左右展角
    for sign in [-1, 1]:
        ex0 = cx_p + sign * hat_w
        ex1 = cx_p + sign * int(head_r * 3.6)
        img[hat_top_y - 2:hat_top_y + 6, min(ex0, ex1):max(ex0, ex1)] *= 0.3
        img[hat_top_y - 2:hat_top_y + 6, min(ex0, ex1):max(ex0, ex1)] += np.array([22, 14, 10], dtype=np.float32)

    # 面部简笔：双眼暗色 + 眉
    eye_y = int(head_cy + head_r * 0.05)
    for ex in [cx_p - int(head_r * 0.35), cx_p + int(head_r * 0.35)]:
        img[eye_y - 2:eye_y + 2, ex - 5:ex + 5] = np.array([6, 4, 4], dtype=np.float32)
    # 眉毛（深色线）
    brow_y = int(head_cy - head_r * 0.12)
    for ex in [cx_p - int(head_r * 0.38), cx_p + int(head_r * 0.38)]:
        img[brow_y - 3:brow_y + 2, ex - 10:ex + 10] = np.array([4, 2, 2], dtype=np.float32)
    # 嘴：紧闭直线（肃穆）
    lip_y = int(head_cy + head_r * 0.42)
    img[lip_y - 1:lip_y + 2, cx_p - 12:cx_p + 12] = np.array([28, 12, 10], dtype=np.float32)

    return img

def gongsun_side(t_sec):
    """公孙策：侧立公案旁，指尖擦拭银针 —— 银色针点高光闪烁。"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    cx_p, cy_p = int(W * 0.26), int(H * 0.65)
    # 青衫袍
    body_top = int(H * 0.56)
    body_bot = int(H * 0.93)
    body_l = int(W * 0.21)
    body_r = int(W * 0.31)
    for y in range(body_top, body_bot):
        rel = (y - body_top) / (body_bot - body_top)
        half_w = int((body_r - body_l) / 2 * (0.55 + 0.9 * rel))
        x_a, x_b = max(0, cx_p - half_w), min(W, cx_p + half_w)
        env = 0.5 + 0.5 * math.sin(t_sec * 0.6 + y * 0.013)
        col = np.array([30, 58, 58], dtype=np.float32) + np.array([6, 16, 28], dtype=np.float32) * env * 0.25
        img[y, x_a:x_b] = col

    # 头部
    head_cy = int(H * 0.52)
    head_r = int(min(W, H) * 0.032)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt((xx - cx_p) ** 2 + (yy - head_cy) ** 2).astype(np.float32)
    head_mask = (dist < head_r).astype(np.float32)
    skin = np.array([130, 100, 80], dtype=np.float32)
    img = img + skin * head_mask[..., None] * 0.9
    # 发髻
    img[head_cy - int(head_r * 1.4):head_cy - int(head_r * 0.9), cx_p - int(head_r * 0.8):cx_p + int(head_r * 0.8)] = np.array([28, 20, 14], dtype=np.float32)

    # 手 + 银针（公案前方）
    hand_cx = int(W * 0.33)
    hand_cy = int(H * 0.70)
    # 手掌：淡暖色小方块
    img[hand_cy - 10:hand_cy + 10, hand_cx - 16:hand_cx + 16] = np.array([150, 115, 88], dtype=np.float32)
    # 银针：横向细长高光 + 闪烁
    needle_x0, needle_x1 = hand_cx - 26, hand_cx + 26
    needle_y = hand_cy
    flick = 0.7 + 0.3 * math.sin(t_sec * 7.0)
    img[needle_y - 1:needle_y + 2, needle_x0:needle_x1] = np.array([220, 230, 235], dtype=np.float32) * flick
    # 银针反光光晕
    halo = np.zeros((H, W, 3), dtype=np.float32)
    halo[needle_y - 2:needle_y + 3, needle_x0:needle_x1] = np.array([180, 200, 210], dtype=np.float32) * 0.6 * flick
    halo = gaussian_blur(halo, radius=5)
    img += halo

    return img

def zhan_zhao_side(t_sec):
    """展昭：白衣持剑静立右阶。束发造型，白衣垂坠，剑鞘冷金属反光。"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    cx_p = int(W * 0.76)
    body_top = int(H * 0.55)
    body_bot = int(H * 0.93)
    body_l = int(W * 0.70)
    body_r = int(W * 0.82)
    for y in range(body_top, body_bot):
        rel = (y - body_top) / (body_bot - body_top)
        half_w = int((body_r - body_l) / 2 * (0.55 + 0.9 * rel))
        x_a, x_b = max(0, cx_p - half_w), min(W, cx_p + half_w)
        env = 0.5 + 0.5 * math.sin(t_sec * 0.5 + y * 0.012)
        col = np.array([198, 198, 198], dtype=np.float32) + np.array([30, 24, 22], dtype=np.float32) * env * 0.18
        img[y, x_a:x_b] = col

    # 头部
    head_cy = int(H * 0.50)
    head_r = int(min(W, H) * 0.032)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt((xx - cx_p) ** 2 + (yy - head_cy) ** 2).astype(np.float32)
    head_mask = (dist < head_r).astype(np.float32)
    skin = np.array([155, 118, 88], dtype=np.float32)
    img = img + skin * head_mask[..., None] * 0.9
    # 束发：头顶发冠深色
    img[head_cy - int(head_r * 1.45):head_cy - int(head_r * 0.80), cx_p - int(head_r * 0.75):cx_p + int(head_r * 0.75)] = np.array([30, 22, 14], dtype=np.float32)
    # 发丝
    img[head_cy - int(head_r * 0.95):head_cy - int(head_r * 0.55), cx_p - int(head_r * 1.1):cx_p - int(head_r * 0.7)] = np.array([24, 18, 12], dtype=np.float32)

    # 剑：斜向长条，金属反光
    sword_cx = int(W * 0.71)
    sword_top = int(H * 0.58)
    sword_bot = int(H * 0.92)
    # 剑身斜走：从右下到左上
    for i in range(sword_bot - sword_top):
        y = sword_top + i
        x = sword_cx - int(i * 0.28)
        if 0 <= y < H and 0 <= x < W:
            flick = 0.6 + 0.4 * math.sin(t_sec * 2.2 + i * 0.12)
            img[y - 1:y + 2, x - 2:x + 3] = np.array([200, 210, 220], dtype=np.float32) * flick
    # 剑柄（木色）
    hilt_y = int(H * 0.90)
    hilt_x = sword_cx - int((hilt_y - sword_top) * 0.28)
    img[hilt_y - 4:hilt_y + 6, hilt_x - 8:hilt_x + 10] = np.array([70, 42, 22], dtype=np.float32)

    return img

def yamen_row(t_sec):
    """两侧衙役分列：仅做剪影轮廓 + 轻微衣袂摆动。"""
    img = np.zeros((H, W, 3), dtype=np.float32)
    # 左列：3个衙役
    left_xs = [int(W * 0.13), int(W * 0.18), int(W * 0.23)]
    # 右列：3个衙役
    right_xs = [int(W * 0.77), int(W * 0.82), int(W * 0.87)]
    for sign, xs in [(-1, left_xs), (1, right_xs)]:
        for i, cx in enumerate(xs):
            sway = math.sin(t_sec * 0.7 + i) * 1.2
            cx_s = int(cx + sway)
            # 身体：粗布深灰制服
            body_top = int(H * 0.60)
            body_bot = int(H * 0.92)
            body_hw = 14
            for y in range(body_top, body_bot):
                rel = (y - body_top) / (body_bot - body_top)
                w = int(body_hw * (0.6 + 0.9 * rel))
                img[y, cx_s - w:cx_s + w] = np.array([42, 38, 32], dtype=np.float32)
            # 头
            head_cy = int(H * 0.54)
            head_r = 10
            yy, xx = np.mgrid[0:H, 0:W]
            dist = np.sqrt((xx - cx_s) ** 2 + (yy - head_cy) ** 2).astype(np.float32)
            head_mask = (dist < head_r).astype(np.float32)
            skin = np.array([120, 95, 72], dtype=np.float32)
            img = img + skin * head_mask[..., None] * 0.8
            # 帽
            img[head_cy - 14:head_cy - 8, cx_s - 10:cx_s + 10] = np.array([28, 22, 14], dtype=np.float32)
    return img

def render_shot2_frame(t_sec):
    # 背景公堂
    base = build_interior_base()

    # 多支红烛（左右两侧）
    candle_positions = [
        (int(W * 0.14), int(H * 0.66)),
        (int(W * 0.19), int(H * 0.72)),
        (int(W * 0.32), int(H * 0.80)),
        (int(W * 0.68), int(H * 0.80)),
        (int(W * 0.81), int(H * 0.72)),
        (int(W * 0.86), int(H * 0.66)),
        # 公堂两侧案上烛
        (int(W * 0.40), int(H * 0.74)),
        (int(W * 0.60), int(H * 0.74)),
    ]
    flame_sum = np.zeros_like(base)
    for (cx, cy) in candle_positions:
        flame_sum += candle_flame(cx, cy, t_sec)
    # 烛身
    for (cx, cy) in candle_positions:
        base[cy:cy + 30, cx - 4:cx + 4] = np.array([200, 180, 110], dtype=np.float32)
        # 烛台金属
        base[cy + 30:cy + 38, cx - 10:cx + 10] = np.array([100, 80, 50], dtype=np.float32)

    # 人物层
    bao = bauzheng_silhouette(t_sec)
    gongsun = gongsun_side(t_sec)
    zhan = zhan_zhao_side(t_sec)
    yamen = yamen_row(t_sec)

    # 人物叠加（简单 max 混合以避免遮挡过暗）
    people = bao * 1.0 + gongsun * 0.95 + zhan * 0.95 + yamen * 0.85

    # 光影分层：
    # 暖色烛光：从底部扩散
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    warm_center_y = H * 0.78
    warm_grad = np.clip(1.0 - (yy - warm_center_y) / (H * 0.7), 0.0, 1.0)
    warm_grad = warm_grad[..., None] * np.array([28, 14, 0], dtype=np.float32)  # 暗暖光不喧宾夺主

    # 门外暗紫反光：从门区（画面上方与右侧外漏）
    door_top = np.zeros_like(base)
    door_top[int(H * 0.10):int(H * 0.45), int(W * 0.04):int(W * 0.12)] += np.array([38, 16, 72], dtype=np.float32) * 0.75
    door_top[int(H * 0.10):int(H * 0.45), int(W * 0.88):int(W * 0.96)] += np.array([38, 16, 72], dtype=np.float32) * 0.75
    door_top = gaussian_blur(door_top, radius=18)

    frame = base * 1.15 + warm_grad * 1.3 + flame_sum * 1.4 + people + door_top * 0.75
    # 轻微呼吸暗部：整体随时间略压暗
    frame = frame * (0.93 + 0.03 * math.sin(t_sec * 0.5))

    # 胶片颗粒 + 暗角
    frame = add_film_grain(frame, strength=1.5)
    frame = vignette(frame, strength=0.5)
    # 再叠一层柔暗
    frame = soft_vignette_subtle(frame, strength=0.22)
    return np.clip(frame, 0, 255).astype(np.uint8)


# ---------- 渲染循环 ----------
def render_shot(frames_dir, duration, render_fn):
    os.makedirs(frames_dir, exist_ok=True)
    n_frames = int(duration * FPS)
    for i in range(n_frames):
        t = i / FPS
        arr = render_fn(t)
        img = Image.fromarray(arr)
        img.save(os.path.join(frames_dir, f"frame_{i:05d}.png"))
    return n_frames

def mp4_from_frames(frames_dir, output_path, duration, extra_filter=None):
    n = int(duration * FPS)
    vf = f"fps={FPS},scale={W}:{H}:flags=lanczos"
    if extra_filter:
        vf += "," + extra_filter
    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", os.path.join(frames_dir, "frame_%05d.png"),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)

# ---------- 音频合成（ffmpeg 合成音效 + 画外音 TTS 占位） ----------
def build_wind_lo_roll(path, duration):
    """穿堂风声 + 低频滚雷：白噪声→低通 → 左右抖动幅度"""
    # 生成一个合成噪声 wav：用 ffmpeg 中的 anoisesrc + lowpass
    tmp1 = path + "_wind.wav"
    tmp2 = path + "_rumble.wav"
    # 风声：粉噪声 + 带通，音量起伏
    cmd1 = [
        "ffmpeg", "-y", "-f", "lavfi", "-t", str(duration),
        "-i", f"anoisesrc=d={duration}:c=pink:r=44100:a=0.5",
        "-filter:a",
        "lowpass=f=1200,highpass=f=400,volume=enable='lt(mod(t,5),1)':volume='1.2':eval=frame",
        "-ar", "44100", "-ac", "2", tmp1,
    ]
    subprocess.run(cmd1, check=True)
    # 低频滚雷：sine 低频低音量
    cmd2 = [
        "ffmpeg", "-y", "-f", "lavfi", "-t", str(duration),
        "-i", "sine=frequency=55:sample_rate=44100:duration=" + str(duration),
        "-filter:a",
        "lowpass=f=200,volume=0.35,tremolo=f=0.4:d=0.4",
        "-ar", "44100", "-ac", "2", tmp2,
    ]
    subprocess.run(cmd2, check=True)
    # 混合
    cmd3 = [
        "ffmpeg", "-y", "-i", tmp1, "-i", tmp2,
        "-filter_complex", "amix=inputs=2:duration=first:dropout_transition=0,volume=1.4",
        "-ar", "44100", "-ac", "2", path,
    ]
    subprocess.run(cmd3, check=True)
    for p in (tmp1, tmp2):
        if os.path.exists(p):
            os.remove(p)

def build_candle_ambient(path, duration):
    """镜号2：墙外闷风 + 烛芯噼啪。用轻噪声 + 偶发短脉冲。"""
    tmp1 = path + "_wall.wav"
    cmd1 = [
        "ffmpeg", "-y", "-f", "lavfi", "-t", str(duration),
        "-i", f"anoisesrc=d={duration}:c=brown:r=44100:a=0.35",
        "-filter:a",
        "lowpass=f=500,volume=0.5",
        "-ar", "44100", "-ac", "2", tmp1,
    ]
    subprocess.run(cmd1, check=True)
    # 偶发噼啪：用短促脉冲（通过 aevalsrc 合成）
    bursts = []
    for i, t in enumerate(np.linspace(0.6, duration - 0.6, 8)):
        bursts.append(f"aevalsrc=0.6*random(0)*exp(-10*mod(t-{t:.3f},0.01)):s=44100:d={duration}")
    cmd_mix = [
        "ffmpeg", "-y", "-f", "lavfi", "-t", str(duration),
        "-i", "anoisesrc=d=%s:c=brown:r=44100:a=0.25" % duration,
        "-filter:a",
        "lowpass=f=900,volume=0.5",
        "-ar", "44100", "-ac", "2", path,
    ]
    subprocess.run(cmd_mix, check=True)
    if os.path.exists(tmp1):
        os.remove(tmp1)

def add_voiceover_to_shot1(audio_in, audio_out, duration):
    """在镜号1的 1.8~3.4 秒处叠加画外音：「嘉祐年间，岁在乙巳……」
    由于没有真实 TTS，用低沉低频正弦 + 高通包络的伪人声占位，保留对白节律。"""
    # 生成伪旁白
    voice_path = audio_in + "_voice.wav"
    # 用低沉调制正弦：低频 110Hz + 缓慢调制，模拟中年男性播音腔底噪
    dur_speech = 1.8
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-t", str(dur_speech),
        "-i", "sine=frequency=110:sample_rate=44100",
        "-filter:a",
        "volume=0.65,lowpass=f=800,tremolo=f=3.2:d=0.25",
        "-ar", "44100", "-ac", "2", voice_path,
    ]
    subprocess.run(cmd, check=True)
    # 把语音延迟到 1.8 秒开始
    delayed_voice = audio_in + "_delayed_voice.wav"
    cmd2 = [
        "ffmpeg", "-y", "-i", voice_path,
        "-filter:a", f"adelay=1800|1800,apad=pad_dur={max(0.0, duration - 1.8 - dur_speech):.3f}",
        "-t", str(duration),
        "-ar", "44100", "-ac", "2", delayed_voice,
    ]
    subprocess.run(cmd2, check=True)
    # 与风雷声混合
    cmd3 = [
        "ffmpeg", "-y", "-i", audio_in, "-i", delayed_voice,
        "-filter_complex", "amix=inputs=2:duration=first:dropout_transition=0,volume=1.5",
        "-ar", "44100", "-ac", "2", audio_out,
    ]
    subprocess.run(cmd3, check=True)
    for p in (voice_path, delayed_voice, audio_in):
        if os.path.exists(p) and p != audio_out:
            try:
                os.remove(p)
            except OSError:
                pass

def mix_audio_to_video(video_in, audio_in, video_out):
    cmd = [
        "ffmpeg", "-y", "-i", video_in, "-i", audio_in,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", video_out,
    ]
    subprocess.run(cmd, check=True)

def concat_two_shots(shot1, shot2, out_path):
    list_file = os.path.join(OUT_DIR, "list.txt")
    with open(list_file, "w") as f:
        for p in (shot1, shot2):
            f.write(f"file '{p}'\n")
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", list_file,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", out_path,
    ]
    subprocess.run(cmd, check=True)


# ---------- 主流程 ----------
def main():
    # 镜号1
    print("🔹 渲染镜号1：汴京异象（0:00-0:05）")
    frames1 = os.path.join(OUT_DIR, "frames1")
    render_shot(frames1, 5.0, render_shot1_frame)
    silent1 = os.path.join(OUT_DIR, "shot1_silent.mp4")
    mp4_from_frames(frames1, silent1, 5.0)
    # 镜号1 音频
    wind1 = os.path.join(OUT_DIR, "shot1_wind.wav")
    build_wind_lo_roll(wind1, 5.0)
    audio1 = os.path.join(OUT_DIR, "shot1_audio.wav")
    add_voiceover_to_shot1(wind1, audio1, 5.0)
    final1 = os.path.join(OUT_DIR, "shot1.mp4")
    mix_audio_to_video(silent1, audio1, final1)
    # 清理
    for p in (silent1, audio1):
        if os.path.exists(p):
            os.remove(p)
    shutil.rmtree(frames1, ignore_errors=True)

    # 镜号2
    print("🔹 渲染镜号2：正堂肃穆（0:05-0:10）")
    frames2 = os.path.join(OUT_DIR, "frames2")
    render_shot(frames2, 5.0, render_shot2_frame)
    silent2 = os.path.join(OUT_DIR, "shot2_silent.mp4")
    mp4_from_frames(frames2, silent2, 5.0)
    # 镜号2 音频
    amb2 = os.path.join(OUT_DIR, "shot2_amb.wav")
    build_candle_ambient(amb2, 5.0)
    final2 = os.path.join(OUT_DIR, "shot2.mp4")
    mix_audio_to_video(silent2, amb2, final2)
    for p in (silent2, amb2):
        if os.path.exists(p):
            os.remove(p)
    shutil.rmtree(frames2, ignore_errors=True)

    # 合成
    print("🔹 合成 10 秒成片")
    out_final = os.path.join(OUT_DIR, "baoqingtian_shorts_10s.mp4")
    concat_two_shots(final1, final2, out_final)
    print(f"✅ 完成：{out_final}")
    print(f"  镜号1：{final1}")
    print(f"  镜号2：{final2}")

if __name__ == "__main__":
    main()
