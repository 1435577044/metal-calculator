"""
金属算量 · 桌面版外壳
=====================
用 pywebview(WebView2) 把前端包成 Windows 原生窗口，PyInstaller 打成单文件 exe。

可靠性设计：
  pywebview 在部分受限环境（远程桌面、GPU 禁用、策略限制）下 WebView2
  可能无法启动。启动器在加载后做一次轻量健康检查，失败时自动降级为
  系统浏览器打开，功能完全一致，避免"点了没反应"。
"""

import os
import sys
import glob
import json
import base64
import threading
import webbrowser

APP_NAME = "金属算量"
APP_TITLE = "金属算量 · 截面特性与理论单重"
VERSION = "1.1"

# --------------------------------------------------------------------------
# 资源定位：兼容 PyInstaller 单文件解包(_MEIPASS)与源码运行
# --------------------------------------------------------------------------
if getattr(sys, "frozen", False):
    BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR = APP_DIR

UI_DIR = os.path.join(BASE_DIR, "ui")
ENTRY = os.path.join(UI_DIR, "index.html")


# --------------------------------------------------------------------------
# 原生标题栏着色
# --------------------------------------------------------------------------
# 网页里的 CSS 管不到 Windows 标题栏 —— 那是 Win32 原生控件。
# 必须通过 DWM(DirectWrite Manager) API 改，三条路径按能力递进：
#   ① DWMWA_USE_IMMERSIVE_DARK_MODE = 20   Win10 2004+  让系统自动出深色标题栏
#   ② DWMWA_CAPTION_COLOR           = 35   Win11 22000+ 可指定标题栏底色
#   ③ DWMWA_TEXT_COLOR              = 36   Win11 22000+ 可指定标题栏文字色
# 老系统上 ① 失败就静默跳过，不影响功能。
DWMWA_USE_IMMERSIVE_DARK_MODE = 20
DWMWA_USE_IMMERSIVE_DARK_MODE_OLD = 19   # 18985 早期构建只认这个编号
DWMWA_CAPTION_COLOR = 35
DWMWA_TEXT_COLOR = 36

# 与 index.html 的主题变量保持一致
TITLEBAR_DARK = {"caption": 0x1B1C1E, "text": 0xF5F5F5}    # #1b1c1e / #f5f5f5
TITLEBAR_LIGHT = {"caption": 0xF3F3F3, "text": 0x1A1A1A}

# 窗口句柄缓存：hwnd 一旦创建就稳定，但 WebView2 初始化期间可能被重建
_HWND = 0

# 前端上报的主题（None = 尚未上报，按系统主题）。
# 启动补刷线程必须沿用它，否则用户刚点的暗色会被系统主题刷回去。
_theme_choice = None


def _is_window(hwnd):
    import ctypes
    try:
        return bool(ctypes.windll.user32.IsWindow(ctypes.c_void_p(int(hwnd))))
    except Exception:
        return False


def _hwnd_from_webview():
    """从 pywebview 窗口对象取原生 HWND。

    实测坑（pywebview 6.2.1）：`window.gui` 是**模块** `webview.platforms.winforms`，
    并没有 `get_window_handle()` 方法 —— 调用会抛 AttributeError。
    真正的原生句柄挂在 `window.native`（BrowserForm，WinForms.Form 实例）上，
    需取 `.Handle.ToInt32()`。
    """
    try:
        import webview
        if not webview.windows:
            return 0
        native = webview.windows[0].native
        handle = getattr(native, "Handle", None)
        if handle is None:
            return 0
        # pythonnet 的 IntPtr 有 ToInt64/ToInt32；纯 Python 环境可能是 int
        for meth in ("ToInt64", "ToInt32"):
            fn = getattr(handle, meth, None)
            if callable(fn):
                return int(fn())
        return int(handle)
    except Exception:
        return 0


def _hwnd_by_title(title=APP_TITLE):
    """兜底：按窗口标题查找顶层窗口。"""
    try:
        import ctypes
        hwnd = ctypes.windll.user32.FindWindowW(None, title)
        return int(hwnd) if hwnd else 0
    except Exception:
        return 0


def get_hwnd():
    """取得主窗口 HWND，取不到返回 0。

    三级兜底：pywebview native 句柄 → 缓存校验 → 按标题查找。
    """
    global _HWND
    for getter in (_hwnd_from_webview, lambda: _HWND, lambda: _hwnd_by_title()):
        try:
            h = getter()
        except Exception:
            continue
        if h and _is_window(h):
            _HWND = h
            return h
    return 0


def desired_theme():
    """当前应生效的标题栏深浅。

    前端一旦上报过选择（_theme_choice），就以它为准；
    否则跟随系统。这样启动补刷线程不会把用户刚点的暗色刷回白色。
    """
    return get_system_dark() if _theme_choice is None else _theme_choice


def set_theme_choice(dark):
    """记录前端的主题选择，供启动补刷沿用。"""
    global _theme_choice
    _theme_choice = bool(dark)
    return _theme_choice


def _dwm_set(hwnd, attr, ctypes_obj):
    """设置单个 DWM 属性，返回是否成功（S_OK == 0）。

    ctypes_obj 必须是已完成 ctypes 赋值的实例（c_int / c_uint）。
    """
    import ctypes
    try:
        hr = ctypes.windll.dwmapi.DwmSetWindowAttribute(
            ctypes.c_void_p(int(hwnd)), ctypes.c_uint(int(attr)),
            ctypes.byref(ctypes_obj), ctypes.sizeof(ctypes_obj))
        return (hr & 0xFFFFFFFF) == 0
    except Exception:
        return False


def colorize_titlebar(hwnd, dark=True):
    """给原生窗口标题栏上色。返回是否成功；失败静默降级，不阻塞启动。

    实测要点（Windows 11 22631）：
      · 只设属性 20（USE_IMMERSIVE_DARK_MODE）在「系统深色未开启」时**无效**，
        标题栏仍为白色 —— 属性 20 只是向系统"请求"深色，系统可以拒绝。
      · 属性 35/36（CAPTION_COLOR / TEXT_COLOR）才是真正能强制指定颜色的路径，
        但必须是 Win11 22000+，且要**在窗口句柄可用后立即调用**。
      · 设置后需触发一次非客户区重绘，否则系统可能沿用旧画面。
    """
    if not hwnd:
        hwnd = get_hwnd()
    if not hwnd:
        return False
    import ctypes

    # ① 沉浸式深色：让标题栏按钮/边框跟随深色（系统拒绝也不影响 ②③）
    #    19/20 两个编号都设，兼容 18985 早期构建
    _dwm_set(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ctypes.c_int(1 if dark else 0))
    _dwm_set(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_OLD, ctypes.c_int(1 if dark else 0))

    # ②③ 标题栏底色 / 文字色：真正决定背景与文字颜色的路径
    #    COLORREF 为 0x00BBGGRR，不是 CSS 的 #RRGGBB —— 必须反转字节序，
    #    否则会得到完全相反的颜色，这是最容易踩的坑。
    cfg = TITLEBAR_DARK if dark else TITLEBAR_LIGHT
    ok_caption = _dwm_set(hwnd, DWMWA_CAPTION_COLOR,
                           ctypes.c_uint(_colorref(cfg["caption"])))
    ok_text = _dwm_set(hwnd, DWMWA_TEXT_COLOR,
                       ctypes.c_uint(_colorref(cfg["text"])))

    _refresh_frame(hwnd)
    return ok_caption and ok_text


def _refresh_frame(hwnd):
    """请求重绘非客户区（标题栏），让新配色立即反映到屏幕上。

    RDW_FRAME(0x400) 才会触发标题栏重绘；只传 RDW_INVALIDATE 是不够的，
    这是"设了属性但画面不变"的第二个坑。
    """
    import ctypes

    RDW_INVALIDATE = 0x0001
    RDW_UPDATENOW = 0x0100
    RDW_ERASE = 0x0004
    RDW_FRAME = 0x0400
    RDW_ALLCHILDREN = 0x0080

    try:
        u = ctypes.windll.user32
        h = ctypes.c_void_p(int(hwnd))
        u.RedrawWindow(h, None, None,
                       RDW_INVALIDATE | RDW_UPDATENOW | RDW_ERASE |
                       RDW_FRAME | RDW_ALLCHILDREN)
        # SWP_FRAMECHANGED 让 DWM 重新合成边框与标题栏
        SWP_NOSIZE = 0x0001
        SWP_NOMOVE = 0x0002
        SWP_NOZORDER = 0x0004
        SWP_NOACTIVATE = 0x0010
        SWP_FRAMECHANGED = 0x0020
        u.SetWindowPos(h, None, 0, 0, 0, 0,
                       SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER |
                       SWP_NOACTIVATE | SWP_FRAMECHANGED)
    except Exception:
        pass


def _colorref(rgb):
    """CSS 十六进制（0xRRGGBB）转 Win32 COLORREF（0x00BBGGRR）。"""
    r = (rgb >> 16) & 0xFF
    g = (rgb >> 8) & 0xFF
    b = rgb & 0xFF
    return (b << 16) | (g << 8) | r


def get_system_dark():
    """读取系统是否处于深色模式；失败默认 False（亮色）。"""
    try:
        import winreg
        key = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            return int(winreg.QueryValueEx(k, "AppsUseLightTheme")[0]) == 0
    except Exception:
        return False


def message_box(title, text, icon=0x10):
    """无控制台窗口下的错误提示。"""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, title, icon)
    except Exception:
        pass


def has_webview2():
    """检测 Microsoft Edge WebView2 运行时。"""
    patterns = [
        r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe",
        r"C:\Program Files\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe",
        os.path.expandvars(
            r"%LOCALAPPDATA%\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe"
        ),
    ]
    return any(glob.glob(p) for p in patterns)


def open_in_browser():
    """降级：用系统默认浏览器打开，功能等价。"""
    webbrowser.open(f"file:///{ENTRY.replace(os.sep, '/')}")
    return 0


# --------------------------------------------------------------------------
# 供前端调用的本地能力
# --------------------------------------------------------------------------
class Api:
    def version(self):
        return VERSION

    def open_data_dir(self):
        try:
            os.startfile(APP_DIR)
        except Exception:
            pass
        return True

    def health(self):
        """前端启动后可回读，确认脚本已就绪。"""
        return "ok"

    # ---------------- 文件保存 ----------------
    # WebView2 默认不处理 Blob 下载（a[download] 无效），故由原生层
    # 弹出保存对话框并落盘。前端检测到 pywebview 时走这条路径。

    def save_file(self, filename, content_b64, file_types):
        """弹出保存对话框并写入文件。

        :param filename:       建议文件名（含扩展名）
        :param content_b64:    文件内容的 base64（避免中文编码问题）
        :param file_types:     文件类型描述列表，如 [["Excel 工作簿", ".xlsx"]]
        :return: 实际保存路径；用户取消返回空字符串
        """
        import webview

        try:
            types = [(t[0], t[1]) for t in (file_types or [["文件", ".*"]])]
            path = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=filename,
                file_types=types,
            )
            if not path:
                return ""
            target = path[0] if isinstance(path, (list, tuple)) else path
            data = base64.b64decode(content_b64)
            with open(target, "wb") as f:
                f.write(data)
            return target
        except Exception as exc:                      # noqa: BLE001
            message_box(APP_NAME, f"保存失败：\n{exc}")
            return ""

    def get_theme(self):
        """前端首次初始化时读取系统是否深色（true = 深色）。"""
        return get_system_dark()

    def set_titlebar(self, dark):
        """网页主题切换时，同步把原生标题栏改成深色或亮色。

        网页 CSS 管不到 Win32 标题栏，必须走 DWM API。
        注意：pywebview 的 js_api 方法运行在**后台线程**，而 DWM/窗口句柄
        操作要求在 UI 线程执行才稳定 —— 这里用 evaluate_js 无法解决，
        改为直接调用（DwmSetWindowAttribute 本身是线程安全的），
        并对句柄失效做重试。
        """
        for attempt in range(3):
            hwnd = get_hwnd()
            if hwnd:
                set_theme_choice(dark)         # 记住用户选择，供启动补刷沿用
                return colorize_titlebar(hwnd, bool(dark))
            import time
            time.sleep(0.15 * (attempt + 1))
        return False


def main():
    if not os.path.isfile(ENTRY):
        message_box(APP_NAME, f"启动失败：未找到界面文件\n{ENTRY}")
        return 1

    if not has_webview2():
        message_box(
            APP_NAME,
            "本机未检测到 Microsoft Edge WebView2 运行时。\n\n"
            "将改用系统浏览器打开，功能完全相同。\n\n"
            "若希望使用独立窗口，可前往安装：\n"
            "https://developer.microsoft.com/microsoft-edge/webview2/",
        )
        return open_in_browser()

    try:
        import webview
    except ImportError:
        message_box(APP_NAME, "缺少 pywebview 运行组件，改用浏览器打开。")
        return open_in_browser()

    try:
        webview.create_window(
            APP_TITLE,
            ENTRY,
            js_api=Api(),
            width=1360,
            height=880,
            min_size=(1080, 700),
            background_color="#f5f6f8",
            confirm_close=False,
            text_select=False,
        )
    except Exception as exc:  # noqa: BLE001
        message_box(APP_NAME, f"窗口创建失败：\n{exc}\n\n将改用浏览器打开。")
        return open_in_browser()

    def paint_titlebar():
        """等窗口句柄就绪后立刻给标题栏上色。

        属性 35/36 必须在句柄可用时立即设置 —— 窗口显示后再改容易不生效，
        因此这里短间隔轮询直到拿到有效句柄，之后再补几次以防句柄被重建
        （WebView2 初始化过程会重建 Form）。
        """
        import time
        deadline = time.time() + 25
        while time.time() < deadline:
            hwnd = get_hwnd()
            if hwnd:
                colorize_titlebar(hwnd, desired_theme())
                break
            time.sleep(0.05)
        # 句柄可能随后重建（WebView2 初始化过程），再补几次。
        # desired_theme() 会沿用前端已选的主题，不会覆盖用户选择。
        for _ in range(10):
            time.sleep(0.4)
            colorize_titlebar(get_hwnd(), desired_theme())

    threading.Thread(target=paint_titlebar, daemon=True).start()

    def watchdog():
        """
        加载后探活：若 WebView2 渲染进程始终无法就绪，
        则关闭空窗口并降级到浏览器，避免用户对着白屏。
        """
        import time
        ok = False
        for _ in range(8):
            time.sleep(1.5)
            try:
                if webview.windows[0].evaluate_js("typeof Geo") == "object":
                    ok = True
                    break
            except Exception:
                continue
        if ok:
            return
        # 未就绪：多半是环境不支持，降级
        try:
            for w in webview.windows:
                w.destroy()
        except Exception:
            pass
        open_in_browser()
        os._exit(0)

    threading.Thread(target=watchdog, daemon=True).start()

    try:
        webview.start(debug=False, private_mode=True)
    except Exception as exc:  # noqa: BLE001
        message_box(APP_NAME, f"界面启动异常：\n{exc}")
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())