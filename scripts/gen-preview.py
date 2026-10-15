#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
gen-preview.py —— 生成集市详情页预览图 preview.png（1280x800）

设计：浅蓝渐变底 + 左侧产品卡（图标/名称/副标题）+ 右侧功能列表卡 + 底部特性胶囊。
产出：项目根目录 preview.png（vite 构建时复制进 dev/，部署与打包随之带上）。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1280, 800
OUT = os.path.join(os.path.dirname(__file__), "..", "preview.png")

FONT_DIR = r"C:\Windows\Fonts"
def font(size, bold=False):
    name = "msyhbd.ttc" if bold else "msyh.ttc"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

# --- 背景：浅蓝渐变 ---
img = Image.new("RGB", (W, H), "#eef4ff")
top, bottom = (238, 244, 255), (214, 231, 255)
for y in range(H):
    t = y / H
    c = tuple(int(a + (b - a) * t) for a, b in zip(top, bottom))
    ImageDraw.Draw(img).line([(0, y), (W, y)], fill=c)
draw = ImageDraw.Draw(img)

# 装饰圆
deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d2 = ImageDraw.Draw(deco)
d2.ellipse([W-260, -140, W+140, 260], fill=(59, 130, 246, 28))
d2.ellipse([-160, H-220, 240, H+180], fill=(59, 130, 246, 24))
img = Image.alpha_composite(img.convert("RGBA"), deco).convert("RGB")
draw = ImageDraw.Draw(img)

BLUE = (37, 99, 235)
DARK = (30, 41, 59)
GRAY = (71, 85, 105)

# --- 左侧产品卡 ---
card = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)
cd.rounded_rectangle([0, 0, 560, 560], 28, fill=(255, 255, 255, 255))
shadow = Image.new("RGBA", (img.width, img.height), (0,0,0,0))
img.paste(card, (70, 90), card)
draw = ImageDraw.Draw(img)

# 图标
icon = Image.open(os.path.join(os.path.dirname(__file__), "..", "icon.png")).convert("RGBA")
icon = icon.resize((180, 180), Image.LANCZOS)
mask = Image.new("L", (180, 180), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 180, 180], 36, fill=255)
img.paste(icon, (110, 150), mask)
draw = ImageDraw.Draw(img)

draw.text((110, 370), "资产管家", font=font(58, True), fill=DARK)
draw.text((110, 452), "多端资产管理与记账", font=font(30), fill=GRAY)
draw.text((110, 505), "数据保存在思源 · 随云同步多端可用", font=font(22), fill=(100, 116, 139))

# 分隔线
draw.line([(110, 560), (590, 560)], fill=(226, 232, 240), width=2)
draw.text((110, 580), "Asset Steward for SiYuan", font=font(22), fill=BLUE)

# --- 右侧功能卡 ---
feats = [
    ("账户五分组", "现金流 / 投资 / 固定 / 贵重 / 负债"),
    ("快速记账", "分类快捷选择 · 标签筛选 · CSV 导出"),
    ("规划追踪", "订阅 / 保单 / 贷款 / 储蓄全覆盖"),
    ("净资产快照", "每日自动记录 · 环图与趋势报表"),
]
fx, fy, fw = 670, 90, 540
card2 = Image.new("RGBA", (fw, 560), (0, 0, 0, 0))
cd2 = ImageDraw.Draw(card2)
cd2.rounded_rectangle([0, 0, fw, 560], 28, fill=(255, 255, 255, 255))
img.paste(card2, (fx, fy), card2)
draw = ImageDraw.Draw(img)

y = fy + 40
for i, (t, d) in enumerate(feats):
    # 序号圆点
    draw.ellipse([fx+32, y+6, fx+64, y+38], fill=BLUE)
    draw.text((fx+41, y+9), str(i+1), font=font(20, True), fill=(255, 255, 255))
    draw.text((fx+84, y), t, font=font(28, True), fill=DARK)
    draw.text((fx+84, y+42), d, font=font(20), fill=GRAY)
    y += 126

# --- 底部特性胶囊 ---
pills = ["每日快照", "消费诊断", "额度预警", "导出 CSV"]
px = 70
for p in pills:
    tw = draw.textlength(p, font=font(24))
    draw.rounded_rectangle([px, 700, px+tw+48, 756], 28, fill=(255, 255, 255), outline=(191, 219, 254), width=2)
    draw.text((px+24, 712), p, font=font(24), fill=BLUE)
    px += int(tw) + 72

img.save(OUT, "PNG")
print("已生成:", os.path.abspath(OUT), img.size)
