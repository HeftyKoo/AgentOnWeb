# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**把你原生的编程助手带到你正在使用的网页上。**

AgentOnWeb 将你的编程工作区带到你当前打开的页面上。一边看视频、查阅文档，或保持某个网站在视野中，一边与你的助手协作——然后无需离开对话即可切回原页面。

**直接在网页上使用 Codex。** 在内置终端中打开项目，查看正在运行的会话，在任务完成或需要审批时收到提醒。点击会话即可回到对应终端。AgentOnWeb 也支持完整的 **DeepSeek Harness (DSH)** 工作区，保留会话、工具、审批、模型及插件。

| 模式 | 功能 |
| --- | --- |
| **Chill（轻松）** | 在半透明的工作区中工作，网页在背后依然可见。可调整透明度以适应页面。 |
| **Focus（专注）** | 为同一工作区切换不透明背景，专注编程。 |
| **Watch（观看）** | 隐藏工作区，正常使用网页，同时保留一个小型 dock，随时唤回你的助手。 |

切换模式不会中断会话。在 Chill 模式下，双击 **Option / Alt** 可与网页交互；再次双击即可返回工作区。

## 观看演示

[![在 YouTube 上观看 AgentOnWeb 演示](docs/assets/agentonweb-demo-cover.png)](https://www.youtube.com/watch?v=s083RpD38HU)

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

## 使用 Codex

适用于 **macOS + Chrome**。请先安装 [Node.js 22.19+](https://nodejs.org/en/download)，并安装、登录 Codex。

### 1. 一键配置终端

在 Mac 的“终端”中运行一次：

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
```

安装器会配置本机终端、登录自动启动、Chrome 连接和 Codex 通知，并保留你已有的 Codex 设置。

### 2. 在网页上使用 Codex

打开任意网站，点击 AgentOnWeb，在它的终端中进入项目目录并启动 Codex：

```sh
cd ~/你的项目
codex
```

要接收会话通知，在 Codex 中打开 `/hooks`，审查并信任 **AgentOnWeb session status**，然后新建一个 Codex 会话。已安装的 hooks 只需信任一次。

点击终端标签栏的 **+** 打开另一个项目，点击标签切换，双击名称重命名，点击 **×** 关闭。隐藏工作区或刷新网页不会中断正在运行的会话。

[安装与常见问题](docs/one-command-setup.md) · [终端指南](packages/terminal-host/README.md)

## 使用 DeepSeek Harness

### 1. 配置 DSH

你需要 **Node.js 22.19+**、**DeepSeek Harness**，以及在 DSH 中配置好的模型服务商凭据。浏览器扩展会连接运行在你电脑上的 DSH。

如果尚未安装 DSH：

```sh
npm install -g @deepseek-ai/dsh@latest
```

在 DSH 中配置服务商凭据（例如 `DEEPSEEK_API_KEY`），然后安装 AgentOnWeb 集成并启动工作区：

```sh
dsh plugin --profile web add @agentonweb/dsh-surface@0.2.0
dsh web
```

使用扩展期间请保持 `dsh web` 运行。如果安装插件时 DSH 已在运行，请重启它。模型凭据保存在 DSH 中；你无需在扩展中输入 API 密钥。

### 2. 连接你的浏览器

1. 安装并启用浏览器扩展，然后打开一个普通网站。
2. 点击扩展工具栏图标或右下角的 dock 打开 AgentOnWeb。展开 dock，点击 **+**，选择 **DeepSeek Harness**，按提示点击 **Connect（连接）**。
3. 在打开的 DSH 页面中，点击 **Allow connection（允许连接）**。
4. 回到你的网站，开始在 DSH 工作区中工作。

Safari 可能还会请求允许访问网站以及本地会话存储。按照浏览器提示完成连接即可。

授权后，只要 DSH 在运行，浏览器就会自动重新连接。你可以通过 **DSH Settings（设置）→ AgentOnWeb → Revoke connection（撤销连接）** 移除访问权限。

## 日常操作

通过 dock 在 Codex 终端与 DSH 工作区之间切换，两边的会话都会继续运行。

使用右下角的 dock 切换 **Chill**、**Focus** 或 **Watch**。默认打开 Chill 模式，并带有透明度滑块。关闭面板或使用工具栏图标可将其隐藏；dock 始终可用，便于重新打开。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 显示或隐藏 AgentOnWeb | `Control+0` | `Alt+0` |
| Chill / Focus / Watch | `Control+1 / 2 / 3` | `Alt+1 / 2 / 3` |
| 切换工作区 | `` Control+` `` | `` Alt+` `` |
| 在 Chill 模式下切换工作区与网页的交互 | 双击 `Option` | 双击 `Alt` |

快捷键的可用性取决于浏览器及已有的按键绑定。你可以在浏览器的扩展快捷键设置中调整。AgentOnWeb 适用于普通 HTTP(S) 网站；浏览器受保护的页面（如扩展设置页）无法承载工作区。

## 开发

源码安装、浏览器构建及验证步骤请参阅[开发文档](docs/development.md)，打包与发布请参阅[发布指南](docs/releasing.md)。

## 链接

[报告问题](https://github.com/HeftyKoo/AgentOnWeb/issues) · [隐私政策](https://heftykoo.github.io/AgentOnWeb/privacy.html) · [更新记录](CHANGELOG.md)
