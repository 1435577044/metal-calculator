"""原生标题栏着色校验（Windows 桌面版）

背景：网页 CSS 管不到 Win32 标题栏，必须走 DWM API。
三条路径按能力递进，本测试逐条验证：

  ① DWMWA_USE_IMMERSIVE_DARK_MODE = 20   Win10 2004+
  ② DWMWA_CAPTION_COLOR           = 35   Win11 22000+
  ③ DWMWA_TEXT_COLOR              = 36   Win11 22000+

关键坑：COLORREF 是 0x00BBGGRR，与 CSS 的 #RRGGBB 字节序相反，
直接传会得到完全相反的颜色。_colorref() 负责反转，此处必须验证它。

用法：python test-shell.py     （需已安装 pywebview）
"""
import ctypes
import importlib.util
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TITLE = '金属算量 · 截面特性与理论单重'

STATS = {'pass': 0, 'fail': 0}


def ok(cond, msg):
    if cond:
        STATS['pass'] += 1
    else:
        STATS['fail'] += 1
    print(('  ok   ' if cond else '  FAIL ') + msg)


def load_shell():
    """以非 __main__ 名加载 main.py，避免触发 GUI 启动。"""
    spec = importlib.util.spec_from_file_location('mz_shell', os.path.join(HERE, 'main.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def windows_build():
    class OSVERINFOEX(ctypes.Structure):
        _fields_ = [('dwOSVersionInfoSize', ctypes.c_uint), ('dwMajorVersion', ctypes.c_uint),
                    ('dwMinorVersion', ctypes.c_uint), ('dwBuildNumber', ctypes.c_uint),
                    ('dwPlatformId', ctypes.c_uint), ('szCSDVersion', ctypes.c_wchar * 128),
                    ('wServicePackMajor', ctypes.c_ushort), ('wServicePackMinor', ctypes.c_ushort),
                    ('wSuiteMask', ctypes.c_ushort), ('bProductType', ctypes.c_byte),
                    ('bReserved', ctypes.c_byte)]

    v = OSVERINFOEX()
    v.dwOSVersionInfoSize = ctypes.sizeof(OSVERINFOEX)
    ctypes.windll.ntdll.RtlGetVersion(ctypes.byref(v))
    return v.dwMajorVersion, v.dwMinorVersion, v.dwBuildNumber


def find_window():
    u = ctypes.windll.user32
    EP = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_long)
    hits = []

    def cb(h, l):
        if not u.IsWindowVisible(h):
            return True
        b = ctypes.create_unicode_buffer(256)
        u.GetWindowTextW(h, b, 256)
        if b.value == TITLE:          # 精确匹配，避免误抓资源管理器等
            hits.append(h)
        return True

    u.EnumWindows(EP(cb), 0)
    return hits


def main():
    print('═' * 62)
    print('  原生标题栏着色校验')
    print('═' * 62)

    M = load_shell()
    major, minor, build = windows_build()
    print(f'\n系统：Windows {major}.{minor}  Build {build}')
    if build >= 22000:
        print('  → Win11 22000+，DWM 属性 35/36 可用')
    elif build >= 19041:
        print('  → Win10 2004+，仅属性 20 可用（标题栏随系统色）')
    else:
        print('  → 低于 Win10 2004，属性 20 可能无效')
    print()

    # ── 1. COLORREF 字节序 ──
    print('── 1. COLORREF 字节序转换 ──')
    for css, label in [(0x1B1C1E, 'Win11 Mica 底'), (0xF5F5F5, '正文色'),
                       (0xFFFFFF, '白'), (0x000000, '黑'), (0x60CDFF, 'Win11 亮蓝')]:
        cr = M._colorref(css)
        back = ((cr & 0xFF) << 16) | ((cr >> 8 & 0xFF) << 8) | (cr >> 16 & 0xFF)
        ok(back == css, f'{label:14} # {css:06X} → COLORREF 0x{cr:06X} → 反解 # {back:06X}')
    # 已知易错点：纯红
    ok(M._colorref(0xFF0000) == 0x0000FF, '纯红 #FF0000 → 0x0000FF（BGR 反转）')
    print()

    # ── 2. 属性常量 ──
    print('── 2. DWM 属性编号 ──')
    ok(M.DWMWA_USE_IMMERSIVE_DARK_MODE == 20, '属性 20 = USE_IMMERSIVE_DARK_MODE')
    ok(M.DWMWA_USE_IMMERSIVE_DARK_MODE_OLD == 19, '属性 19 = 旧版深色属性（18985 兼容）')
    ok(M.DWMWA_CAPTION_COLOR == 35, '属性 35 = CAPTION_COLOR')
    ok(M.DWMWA_TEXT_COLOR == 36, '属性 36 = TEXT_COLOR')
    print()

    # ── 3. 系统主题读取 ──
    print('── 3. 系统深色偏好读取 ──')
    sysdark = M.get_system_dark()
    ok(isinstance(sysdark, bool), f'get_system_dark() 返回 bool：{sysdark}')
    print()

    # ── 4. 真实窗口上的 DWM 行为 ──
    # 窗口相关的完整验证（含像素级）已独立到 test-titlebar-e2e.py，
    # 这里只做属性读写与接口健壮性的快速检查。
    print('── 4. 真实窗口 DWM 设置 ──')
    exe = os.path.abspath(os.path.join(HERE, '..', 'dist', '金属算量.exe'))
    if not os.path.isfile(exe):
        print(f'  跳过：未找到 {exe}（先运行 PyInstaller 打包）')
        print()
    else:
        proc = subprocess.Popen([exe])
        hwnd = None
        for _ in range(15):
            time.sleep(1)
            hits = find_window()
            if hits:
                hwnd = hits[0]
                break
        if hwnd is None:
            print('  跳过：窗口未出现（无桌面会话？改用 test-titlebar-e2e.py）')
            proc.terminate()
            print()
        else:
            print(f'  窗口句柄 {hwnd}')
            dwm = ctypes.windll.dwmapi

            def getattr_attr(a):
                v = ctypes.c_uint(0)
                hr = dwm.DwmGetWindowAttribute(ctypes.c_void_p(int(hwnd)), ctypes.c_uint(a),
                                               ctypes.byref(v), ctypes.sizeof(v))
                return hr & 0xFFFFFFFF, v.value

            def setattr_raw(a, val):
                hr = dwm.DwmSetWindowAttribute(ctypes.c_void_p(int(hwnd)), ctypes.c_uint(a),
                                               ctypes.byref(val), ctypes.sizeof(val))
                return hr & 0xFFFFFFFF

            # 属性 20：Set 返回 S_OK 即生效，但 Win11 22631 上 **不支持回读**
            # （实测 Get 恒返回 0，无论 Set 了什么）。因此只断言 Set 的返回值，
            # 画面是否真的生效由属性 35/36 的像素验证（见 test-titlebar-e2e.py）。
            ok(setattr_raw(20, ctypes.c_int(1)) == 0, '设置属性 20 = 1（深色）')
            time.sleep(0.2)
            ok(setattr_raw(20, ctypes.c_int(0)) == 0, '设置属性 20 = 0（亮色）')
            time.sleep(0.2)
            hr20, v20 = getattr_attr(20)
            print(f'  info 属性 20 回读 hr=0x{hr20:08X} value={v20}'
                  '（Win11 不支持回读属正常，不作断言）')

            # 属性 35/36：Set 返回 S_OK 即生效（Get 不支持回读是正常的）
            hr_cap = setattr_raw(35, ctypes.c_uint(M._colorref(M.TITLEBAR_DARK['caption'])))
            hr_txt = setattr_raw(36, ctypes.c_uint(M._colorref(M.TITLEBAR_DARK['text'])))
            ok(hr_cap == 0, f'设置属性 35（标题栏底色）hr=0x{hr_cap:08X}'
                           + ('' if hr_cap == 0 else '　← 低于 Win11 22000，不支持属正常'))
            ok(hr_txt == 0, f'设置属性 36（标题栏文字色）hr=0x{hr_txt:08X}')
            # 亮色切回
            hr_cap2 = setattr_raw(35, ctypes.c_uint(M._colorref(M.TITLEBAR_LIGHT['caption'])))
            ok(hr_cap2 == 0, '切回亮色标题栏底色')

            # 完整接口调用（走 main.py 的封装）
            ok(M.colorize_titlebar(hwnd, True) is True, 'colorize_titlebar(dark=True) 生效')
            ok(M.colorize_titlebar(hwnd, False) is True, 'colorize_titlebar(dark=False) 生效')

            # hwnd=0/None 时应回退到 get_hwnd() 自救，而不是直接放弃。
            # 这里 EXE 正在运行，能解析到真实句柄，因此返回 True 是正确行为。
            ok(M.colorize_titlebar(0, True) is True, 'hwnd=0 时回退 get_hwnd() 自救')
            ok(M.colorize_titlebar(None, True) is True, 'hwnd=None 时回退 get_hwnd() 自救')
            # 两级兜底都拿不到时必须安全返回 False，不能抛异常
            saved = (M._hwnd_from_webview, M._hwnd_by_title, M._HWND)
            M._hwnd_from_webview = lambda: 0
            M._hwnd_by_title = lambda: 0
            M._HWND = 0
            ok(M.get_hwnd() == 0, '兜底全失效时 get_hwnd() 返回 0')
            ok(M.colorize_titlebar(0, True) is False, '无句柄时安全返回 False')
            M._hwnd_from_webview, M._hwnd_by_title, M._HWND = saved

            # 句柄解析：这是历史 bug 的根因，必须单独验证。
            # pywebview 6.x 的 window.gui 是模块，没有 get_window_handle()；
            # 正确来源是 window.native（BrowserForm）的 .Handle。
            import webview.platforms.winforms as wf
            ok(hasattr(M, 'get_hwnd'), '提供 get_hwnd() 句柄解析函数')
            ok(not hasattr(wf, 'get_window_handle'),
               'pywebview.gui 是模块且无 get_window_handle（旧写法必然抛异常）')
            ok(M.get_hwnd() != 0, f'get_hwnd() 能解析出真实句柄：{M.get_hwnd()}')
            ok(M.get_hwnd() == hwnd, 'get_hwnd() 与 EnumWindows 找到的句柄一致')

            # 主题决策：启动补刷线程必须沿用前端选择，不能覆盖用户操作
            saved_choice = M._theme_choice
            M._theme_choice = None
            ok(M.desired_theme() == M.get_system_dark(), '未上报时跟随系统主题')
            M.set_theme_choice(True)
            ok(M.desired_theme() is True, '上报暗色后不被系统主题覆盖')
            M.set_theme_choice(False)
            ok(M.desired_theme() is False, '上报亮色后不被系统主题覆盖')
            M._theme_choice = saved_choice

            # 端到端：走前端真实调用链 Api().set_titlebar()
            # 旧测试只用 setattr_raw 手动设属性，绕过了 API 路径，
            # 导致"接口其实一直抛 AttributeError"被误判为通过。
            # 这里验证接口返回值，像素级断言见 test-titlebar-e2e.py
            #（本测试不等待启动补刷线程结束，像素可能取到中间态）。
            api_obj = M.Api()
            ok(api_obj.set_titlebar(True) is True,
               'Api.set_titlebar(dark=True) 返回 True（未静默失败）')
            ok(api_obj.set_titlebar(False) is True, 'Api.set_titlebar(dark=False) 返回 True')
            print()

            proc.terminate()
            time.sleep(1)
    # ── 5. 前端联动 ──
    print('── 5. 前端主题联动（app.js）──')
    app = open(os.path.join(HERE, '..', 'js', 'app.js'), encoding='utf-8').read()
    ok('function applyTheme' in app, '存在 applyTheme()')
    ok('function syncTitleBar' in app, '存在 syncTitleBar()')
    ok('api.set_titlebar' in app, '前端调用原生 set_titlebar 接口')
    ok('function initThemeFromSystem' in app, '存在 initThemeFromSystem()（首启跟随系统）')
    ok('mz-theme' in app, '主题选择持久化到 localStorage')
    # js_api 异步注入：必须等 pywebviewready，否则首帧同步会被跳过
    ok("pywebviewready" in app, '监听 pywebviewready 等待 js_api 注入')
    ok('titlebarPending' in app, '未就绪时记录待同步主题（titlebarPending）')
    ok('function onPywebviewReady' in app, '存在 onPywebviewReady() 补发逻辑')

    shell = open(os.path.join(HERE, 'main.py'), encoding='utf-8').read()
    ok('def set_titlebar' in shell, '外壳暴露 set_titlebar 供前端调用')
    ok('def paint_titlebar' in shell, '启动时按系统主题着色标题栏')
    ok('def desired_theme' in shell, '启动补刷沿用前端主题（desired_theme）')
    ok('def get_hwnd' in shell, '提供 get_hwnd()（不依赖 gui.get_window_handle）')
    ok('gui.get_window_handle' not in shell,
       '已移除 gui.get_window_handle（pywebview 6.x 不存在该属性）')
    ok('desired_theme()' in shell, '启动着色经 desired_theme() 决策（不会覆盖用户选择）')

    print()
    print('═' * 62)
    f, ps = STATS['fail'], STATS['pass']
    print(f'  {"全部通过" if f == 0 else str(f) + " 项未通过"}   通过 {ps} / {ps + f}')
    print('═' * 62)
    return 1 if f else 0


if __name__ == '__main__':
    sys.exit(main())
