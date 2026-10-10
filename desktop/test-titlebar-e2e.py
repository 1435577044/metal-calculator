# -*- coding: utf-8 -*-
"""标题栏主题联动 · 端到端验证（真实 EXE 窗口 + 像素级）

与 test-shell.py 的区别：
  test-shell.py  校验纯函数（COLORREF、常量、系统主题读取）+ 可选的窗口测试
  本脚本        启动打包好的 EXE，**通过 Api().set_titlebar() 走前端真实调用链**，
                再用 PrintWindow 抓标题栏像素，确认画面真的变色。

这条链路正是历史 bug 所在：旧代码用 gui.get_window_handle() 取句柄，
在 pywebview 6.x 中该属性不存在，异常被静默吞掉，标题栏永远不变色；
而当时的测试只手动调 setattr_raw，绕过了 API，所以假通过。

用法：python test-titlebar-e2e.py
"""
import ctypes
import importlib.util
import os
import subprocess
import sys
import time
from ctypes import wintypes as wt

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
EXE = os.path.abspath(os.path.join(HERE, "..", "dist", "金属算量.exe"))

u, gdi = ctypes.windll.user32, ctypes.windll.gdi32
ENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_long)
STATS = {"pass": 0, "fail": 0}


def ok(cond, msg):
    if cond:
        STATS["pass"] += 1
    else:
        STATS["fail"] += 1
    print(("  ok   " if cond else "  FAIL ") + msg)
    return cond


def load_shell():
    """以非 __main__ 名加载 main.py，避免触发 GUI 启动。"""
    spec = importlib.util.spec_from_file_location("mz_shell", os.path.join(HERE, "main.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BIH(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG),
                ("biPlanes", wt.WORD), ("biBitCount", wt.WORD), ("biCompression", wt.DWORD),
                ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG),
                ("biYPelsPerMeter", wt.LONG), ("biClrUsed", wt.DWORD),
                ("biClrImportant", wt.DWORD)]


def find_window(title):
    hits = []

    def cb(h, _l):
        if u.IsWindowVisible(h):
            b = ctypes.create_unicode_buffer(256)
            u.GetWindowTextW(h, b, 256)
            if b.value == title:
                hits.append(int(h))
        return True

    u.EnumWindows(ENUMPROC(cb), 0)
    return hits[0] if hits else 0


def titlebar_pixels(hwnd, height=32, width=400):
    """抓标题栏像素，返回按颜色计数的降序列表 [(bgr, n), ...]"""
    r = wt.RECT()
    u.GetWindowRect(ctypes.c_void_p(int(hwnd)), ctypes.byref(r))
    hdc = u.GetWindowDC(ctypes.c_void_p(int(hwnd)))
    mdc = gdi.CreateCompatibleDC(hdc)
    bmp = gdi.CreateCompatibleBitmap(hdc, width, height)
    gdi.SelectObject(mdc, bmp)
    u.PrintWindow(ctypes.c_void_p(int(hwnd)), mdc, 2)      # PW_RENDERFULLCONTENT
    bi = BIH()
    bi.biSize = ctypes.sizeof(BIH)
    bi.biWidth, bi.biHeight = width, -height
    bi.biPlanes, bi.biBitCount, bi.biCompression = 1, 32, 0
    buf = ctypes.create_string_buffer(width * height * 4)
    gdi.GetDIBits(mdc, bmp, 0, height, buf, ctypes.byref(bi), 0)
    data = buf.raw
    gdi.DeleteObject(bmp)
    gdi.DeleteDC(mdc)
    u.ReleaseDC(ctypes.c_void_p(int(hwnd)), hdc)
    counts = {}
    for i in range(0, len(data), 4 * 13):
        k = data[i:i + 3]
        counts[k] = counts.get(k, 0) + 1
    return sorted(counts.items(), key=lambda x: -x[1])


def bgr(rgb):
    return bytes([rgb & 0xFF, (rgb >> 8) & 0xFF, (rgb >> 16) & 0xFF])


def caption_is(M, hwnd, dark):
    """标题栏主像素是否等于目标色（DWM 混色留 ±8 容差）。"""
    u.SetForegroundWindow(ctypes.c_void_p(int(hwnd)))
    time.sleep(0.7)
    px = titlebar_pixels(hwnd)
    if not px:
        return False, "无像素"
    want = bgr(M.TITLEBAR_DARK["caption"] if dark else M.TITLEBAR_LIGHT["caption"])
    top, n = px[0]
    close = all(abs(a - b) <= 8 for a, b in zip(top, want))
    label = "深色" if dark else "亮色"
    return (close and n > 40), f"{label} 实际 #{top.hex()} / 期望 #{want.hex()}（{n}px）"


def main():
    print("═" * 62)
    print("  标题栏主题联动 · 端到端（真实 EXE）")
    print("═" * 62)

    if not os.path.isfile(EXE):
        print(f"  跳过：未找到 {EXE}")
        return 0

    M = load_shell()
    proc = subprocess.Popen([EXE])
    hwnd = 0
    try:
        for _ in range(25):
            time.sleep(1.0)
            hwnd = find_window(M.APP_TITLE)
            if hwnd:
                break
        if not ok(hwnd != 0, "EXE 主窗口出现"):
            return 1
        print(f"  窗口句柄 {hwnd}")
        # 启动补刷线程会持续 ~4s（10 × 0.4s）按主题重刷标题栏，
        # 等它结束再断言，否则测到的是补刷中间态。
        time.sleep(6.0)

        # 句柄解析 —— 历史 bug 的根因
        ok(hasattr(M, "get_hwnd"), "提供 get_hwnd() 句柄解析函数")
        ok(M.get_hwnd() == hwnd,
           f"get_hwnd() 与 EnumWindows 句柄一致（{M.get_hwnd()}）")

        # 主题决策：启动补刷线程必须沿用前端选择，否则会覆盖用户操作。
        # 注意本测试进程与 EXE 进程分离，_theme_choice 不共享，
        # 因此这里只验证决策函数本身的语义。
        M._theme_choice = None
        sys_dark = M.get_system_dark()
        ok(M.desired_theme() == sys_dark, "未上报时 desired_theme() 跟随系统")
        M.set_theme_choice(True)
        ok(M.desired_theme() is True, "上报暗色后 desired_theme() 返回 True（不被系统覆盖）")
        M.set_theme_choice(False)
        ok(M.desired_theme() is False, "上报亮色后 desired_theme() 返回 False")
        M._theme_choice = None

        # 走前端真实调用链
        api = M.Api()
        ok(api.set_titlebar(True) is True,
           "Api.set_titlebar(dark=True) 返回 True（旧代码此处恒为 False）")
        good, detail = caption_is(M, hwnd, True)
        ok(good, f"经 API 切暗色 → {detail}")

        ok(api.set_titlebar(False) is True, "Api.set_titlebar(dark=False) 返回 True")
        good, detail = caption_is(M, hwnd, False)
        ok(good, f"经 API 切亮色 → {detail}")

        # 重复切换（验证没有"只能切一次"的缓存问题）
        for i in range(2):
            api.set_titlebar(i % 2 == 0)
            time.sleep(0.4)
        api.set_titlebar(True)
        good, detail = caption_is(M, hwnd, True)
        ok(good, f"多次切换后仍能切暗 → {detail}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    print()
    print("═" * 62)
    f, p = STATS["fail"], STATS["pass"]
    print(f'  {"全部通过" if f == 0 else str(f) + " 项未通过"}   通过 {p} / {p + f}')
    print("═" * 62)
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
