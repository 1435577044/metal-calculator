"""
生成应用图标 app.ico（纯标准库，无第三方依赖）
在圆角渐变底色上绘制白色 Σ，与界面品牌一致。
ICO 容器内嵌 PNG 数据，Windows Vista 及以上原生支持。
"""
import os
import struct
import zlib

SIZE = 256


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_cover(x, y, w, h, r, ss=3):
    """圆角矩形覆盖率（超采样求抗锯齿）。"""
    n = 0
    for sy in range(ss):
        for sx in range(ss):
            px, py = x + (sx + 0.5) / ss, y + (sy + 0.5) / ss
            cx = min(max(px, r), w - r)
            cy = min(max(py, r), h - r)
            dx, dy = px - cx, py - cy
            if dx * dx + dy * dy <= r * r:
                n += 1
    return n / (ss * ss)


def in_sigma(fx, fy, w, h):
    """归一化坐标 (0..1) 下是否落在 Σ 字形内。"""
    x0, x1 = 0.30, 0.70
    y_top, y_mid, y_bot = 0.355, 0.500, 0.645
    bar = 0.050      # 横线半高
    arm = 0.032     # 斜线半宽
    x_mid = (x0 + x1) / 2

    # 上下两条横线
    if x0 <= fx <= x1 and (y_top <= fy <= y_top + bar or y_bot - bar <= fy <= y_bot):
        return True
    # 上撇：左上 → 中点
    if y_top < fy < y_mid:
        u = (fy - y_top) / (y_mid - y_top)
        x_at = lerp(x0, x_mid, u)
        if abs(fx - x_at) <= arm:
            return True
    # 下撇：中点 → 右下
    if y_mid <= fy < y_bot:
        u = (fy - y_mid) / (y_bot - y_mid)
        x_at = lerp(x_mid, x1, u)
        if abs(fx - x_at) <= arm:
            return True
    return False


def make_png_bytes():
    w = h = SIZE
    radius = int(SIZE * 0.215)
    raw = bytearray()
    for py in range(h):
        raw.append(0)  # 滤波器 0
        for px in range(w):
            a = rounded_cover(px, py, w, h, radius)
            if a <= 0:
                raw += bytes((0, 0, 0, 0))
                continue
            t = (px + py) / (2.0 * (w - 1))
            base = (int(lerp(0x1D, 0x4F, t)), int(lerp(0x4E, 0x9B, t)), int(lerp(0xD8, 0xFA, t)))
            if in_sigma(px / w, py / h, w, h):
                base = (255, 255, 255)
            raw += bytes((base[0], base[1], base[2], int(a * 255)))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


def make_ico(path):
    """写单尺寸 ICO（256×256，内嵌 PNG）。"""
    png = make_png_bytes()
    header = struct.pack("<HHH", 0, 1, 1)                     # reserved, type=icon, count=1
    entry = struct.pack("<BBBBHHII", SIZE % 256, SIZE % 256, 0, 0, 1, 32, len(png), 22)
    with open(path, "wb") as f:
        f.write(header + entry + png)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    ico = os.path.join(here, "app.ico")
    make_ico(ico)
    print("已生成", ico, os.path.getsize(ico), "bytes")