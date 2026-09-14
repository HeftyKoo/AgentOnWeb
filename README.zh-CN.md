# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**把你原生的编程助手带到你正在使用的网页上。**

AgentOnWeb 将你的编程工作区带到你当前打开的页面上。一边看视频、查阅文档，或保持某个网站在视野中，一边与你的助手协作——然后无需离开对话即可切回原页面。

当前版本 **DSH On Web** 将完整的 **DeepSeek Harness (DSH)** 工作区带入 Chrome、Firefox 和 Safari。你的会话、工具、审批、模型以及 DSH 插件都保留在熟悉的界面中。本版本仅支持 DSH。

| 模式 | 功能 |
| --- | --- |
| **Chill（轻松）** | 在半透明的工作区中工作，网页在背后依然可见。可调整透明度以适应页面。 |
| **Focus（专注）** | 为同一工作区切换不透明背景，专注编程。 |
| **Watch（观看）** | 隐藏工作区，正常使用网页，同时保留一个小型 dock，随时唤回你的助手。 |

切换模式不会中断会话。在 Chill 模式下，双击 **Option / Alt** 可与网页交互；再次双击即可返回 DSH。

## 观看演示

[![在 YouTube 上观看 AgentOnWeb 演示](https://img.youtube.com/vi/s083RpD38HU/hqdefault.jpg)](https://www.youtube.com/watch?v=s083RpD38HU)

**[中文演示](https://www.youtube.com/watch?v=DV8s9z-w4GE)** · **[English demo](https://www.youtube.com/watch?v=s083RpD38HU)**

演示包含 Chill、Focus、Watch、透明度调节，以及在真实编程会话中与网页交互的过程。

## 安装与使用教程

**[中文教程](https://www.youtube.com/watch?v=kyeRpiG3asg)** · **[English tutorial](https://www.youtube.com/watch?v=CIfW76WAcwA)**

100 秒演示 DSH 准备、Chrome 商店安装、Connect 连接授权、生成第一个代码文件，以及 Chill、Focus、Watch 的使用方式。两条视频均附字幕和章节时间点。

## 获取扩展

| 浏览器 | 商店安装 |
| --- | --- |
| Chrome | [从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe) |
| Firefox | [从 Firefox 附加组件安装](https://addons.mozilla.org/en-US/firefox/addon/agentonweb/) |
| Safari | 即将上线——Mac App Store 链接将在审核通过后添加。 |

<!-- 在 Safari 商店发布后，将其公开产品链接替换到上方占位符。 -->

Safari 安装链接将在 Mac App Store 版本发布后提供。如果想现在就从源码试用 AgentOnWeb，请参见[开发](#开发)章节。

## 开始使用 AgentOnWeb

### 1. 配置 DSH

你需要 **Node.js 22.19+**、**DeepSeek Harness**，以及在 DSH 中配置好的模型服务商凭据。浏览器扩展会连接运行在你电脑上的 DSH。

如果尚未安装 DSH：

```sh
npm install -g @deepseek-ai/dsh
```

在 DSH 中配置服务商凭据（例如 `DEEPSEEK_API_KEY`），然后安装 AgentOnWeb 集成并启动工作区：

```sh
dsh plugin --profile web add @agentonweb/dsh-surface
dsh web
```

使用扩展期间请保持 `dsh web` 运行。如果安装插件时 DSH 已在运行，请重启它。模型凭据保存在 DSH 中；你无需在扩展中输入 API 密钥。

### 2. 连接你的浏览器

1. 安装并启用浏览器扩展，然后打开一个普通网站。
2. 点击 AgentOnWeb 面板中的 **Connect（连接）**。如果面板被隐藏，可点击扩展的工具栏图标或右下角的 dock。
3. 在打开的 DSH 页面中，点击 **Allow connection（允许连接）**。
4. 回到你的网站，开始在 DSH 工作区中工作。

Safari 可能还会请求允许访问网站以及本地会话存储。按照浏览器提示完成连接即可。

授权后，只要 DSH 在运行，浏览器就会自动重新连接。你可以通过 **DSH Settings（设置）→ AgentOnWeb → Revoke connection（撤销连接）** 移除访问权限。

### 3. 选择你的工作方式

使用右下角的 dock 切换 **Chill**、**Focus** 或 **Watch**。默认打开 Chill 模式，并带有透明度滑块。关闭面板或使用工具栏图标可将其隐藏；dock 始终可用，便于重新打开。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 显示或隐藏 AgentOnWeb | `Control+Shift+O` | `Alt+Shift+O` |
| Chill / Focus / Watch | `Control+Shift+1 / 2 / 3` | `Alt+Shift+1 / 2 / 3` |
| 在 Chill 模式下切换 DSH 与网页的交互 | 双击 `Option` | 双击 `Alt` |

快捷键的可用性取决于浏览器及已有的按键绑定。你可以在浏览器的扩展快捷键设置中调整。AgentOnWeb 适用于普通 HTTP(S) 网站；浏览器受保护的页面（如扩展设置页）无法承载工作区。

## 开发

### 配置工作区

使用 **Node.js 22.19+** 和 **pnpm 11.5.0**，并按上文说明安装和配置 DSH。

```sh
git clone https://github.com/HeftyKoo/AgentOnWeb.git
cd AgentOnWeb
pnpm install
pnpm install:dsh-surface
dsh web
```

`pnpm install:dsh-surface` 会构建本地集成并将其安装到 DSH 的 Web profile。更新插件后请重启 `dsh web`。

### 构建并加载扩展

在另一个终端中，运行适用于你浏览器的构建：

| 浏览器 | 构建命令 | 输出目录 |
| --- | --- | --- |
| Chrome 132+ | `pnpm build:extension` | `apps/extension/.output/chrome-mv3` |
| Firefox 140+ | `pnpm build:extension:firefox` | `apps/extension/.output/firefox-mv2` |
| Safari 18.4+ | `pnpm build:extension:safari` | `apps/extension/.output/safari-mv2` |

- **Chrome：** 打开 `chrome://extensions`，启用**开发者模式**，选择**加载已解压的扩展程序**，然后选择输出目录。
- **Firefox：** 打开 `about:debugging#/runtime/this-firefox`，选择**临时载入附加组件**，然后选择输出目录中的 `manifest.json`。
- **Safari：** 启用 Safari 的开发者功能，使用**添加临时扩展**并选择输出目录。关于签名 macOS 应用，请参阅 [Safari 构建指南](apps/safari/README.md)。

随后在普通网站上按照[连接你的浏览器](#2-连接你的浏览器)操作。

### 验证变更

```sh
pnpm check
```

这会运行仓库检查、类型检查、测试以及浏览器构建。请使用真实扩展和运行中的 DSH 工作区验证交互相关的变更。

如需轻量级的演示预览：

```sh
pnpm build:preview
pnpm preview
```

打包与发布流程请参阅[发布指南](docs/releasing.md)。

## 链接

[报告问题](https://github.com/HeftyKoo/AgentOnWeb/issues) · [隐私政策](https://heftykoo.github.io/AgentOnWeb/privacy.html)
