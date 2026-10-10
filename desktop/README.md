# 金属算量 · 桌面版（exe）

## 产物

`../dist/金属算量.exe` — Windows x64 单文件，双击即用，无需安装、无需联网。

| 项 | 值 |
|---|---|
| 体积 | 11.59 MB |
| 架构 | x64（PE 0x8664） |
| 子系统 | GUI（2，双击无控制台窗口） |
| 界面 | pywebview 6.2.1 + Microsoft Edge WebView2 |
| 图标 | 内嵌 `app.ico`（蓝色渐变 Σ 徽标，纯标准库生成） |

## 运行机制

exe 把前端资源（`ui/index.html` + `js/*.js`）内嵌在自身，启动后解包到临时目录，
再用 WebView2 以独立窗口加载，全程离线。

**降级保护**：启动后有一个看门狗线程做健康检查（探测 `typeof Geo === 'object'`）。
若 12 秒内界面脚本未就绪——例如在远程桌面、GPU 被禁用或企业策略限制等环境下
WebView2 无法渲染——会自动关闭空窗口并改用系统浏览器打开，功能完全一致，
不会出现"双击没反应"或一直白屏的情况。

WebView2 运行时缺失时同样自动降级，并提示安装地址。

## 重新打包

```bash
# 1. 把前端同步到打包目录
cp ../index.html ui/
cp ../js/*.js ui/js/

# 2. 生成图标（可选，仅首次）
python make_icon.py

# 3. 打包
python -m PyInstaller --onefile --windowed --name "金属算量" \
  --icon app.ico --add-data "ui;ui" \
  --distpath ../dist --workpath ./build --specpath ./build \
  --noconfirm --clean main.py
```

> `--add-data` 必须用绝对路径，否则会被 `--specpath` 干扰导致
> `Unable to find ... when adding binary and data files`。

## 标题栏跟随主题（易踩坑）

网页 CSS 管不到 Win32 标题栏，必须走 DWM API。三条路径按能力递进：

| 属性 | 名称 | 最低版本 | 说明 |
|---|---|---|---|
| 20 / 19 | `USE_IMMERSIVE_DARK_MODE` | Win10 2004 | 只是向系统"请求"深色，系统可以拒绝 |
| 35 | `CAPTION_COLOR` | Win11 22000 | 标题栏底色，**真正生效的路径** |
| 36 | `TEXT_COLOR` | Win11 22000 | 标题栏文字色 |

### 坑 1：取窗口句柄的 API 在 pywebview 6.x 中不存在

```python
webview.windows[0].gui.get_window_handle()   # ❌ AttributeError
```

pywebview 6.2.1 的 `window.gui` 是**模块** `webview.platforms.winforms`，
不是实例，没有 `get_window_handle()`。正确来源是 `window.native`
（`BrowserForm`，WinForms.Form 实例）：

```python
int(webview.windows[0].native.Handle.ToInt64())
```

这个异常会被 `except Exception` 静默吞掉，表现为"标题栏死活不变色"。
本项目用 `get_hwnd()` 统一封装，三级兜底：
`window.native.Handle` → 缓存校验 → `FindWindowW(标题)`。

### 坑 2：设了属性画面也不刷新

只 `InvalidateRect` 不够，必须带 `RDW_FRAME` 触发非客户区重绘，
再配合 `SetWindowPos(SWP_FRAMECHANGED)` 让 DWM 重新合成边框。

### 坑 3：COLORREF 是 0x00BBGGRR

与 CSS 的 `#RRGGBB` 字节序相反，必须反转，直接传会得到完全相反的颜色。

### 坑 4：前端 js_api 是异步注入的

页面 `init()` 时 `window.pywebview.api` 往往还不存在，此时同步标题栏会
被跳过。需监听 `pywebviewready` 事件（或轮询等待）后再补发一次。

### 坑 5：启动补刷线程会覆盖用户选择

窗口句柄要等 WebView2 就绪，因此启动时有约 4 秒的补刷线程反复重绘标题栏。
若它固定按系统主题刷，用户在这段时间内点的暗色按钮会被刷回白色。
`desired_theme()` 让补刷沿用前端已选主题（`_theme_choice`）。

## 测试

| 文件 | 覆盖 | 项数 |
|---|---|---|
| `test-shell.py` | COLORREF 字节序、DWM 常量、系统主题读取、前端联动 | 19 |
| `test-titlebar-e2e.py` | 启动真实 EXE，经 `Api.set_titlebar()` 切主题并**抓像素**验证 | 11 |

```bash
python test-shell.py          # 纯函数校验，无需窗口
python test-titlebar-e2e.py   # 端到端（会真的弹窗）
```

> `test-titlebar-e2e.py` 存在的意义：早期 `test-shell.py` 只用 `setattr_raw`
> 手动设 DWM 属性，**绕过了 API 调用路径**，导致"接口其实一直抛
> AttributeError"被误判为通过。e2e 测试必须走 `Api().set_titlebar()`。

## 文件说明

| 文件 | 作用 |
|---|---|
| `main.py` | 桌面外壳：资源定位、WebView2 检测、看门狗降级 |
| `make_icon.py` | 纯标准库生成 app.ico（抗锯齿圆角 + Σ 字形 + ICO 容器） |
| `app.ico` | 应用图标 |
| `ui/` | 前端资源副本（打包用，与项目根目录同步） |