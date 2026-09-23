# Fenghou Qimen Gesture Simulator · 风后奇门手势交互模拟器

A real-time gesture-controlled Qimen formation experiment built with MediaPipe, Three.js and WebGL.

对着电脑摄像头比手势，在浏览器里召唤、拨动一个悬浮的奇门阵盘，并按宫位发动四种术式。

> 这是开发中的交互实验。手势识别还没有经过真人摄像头的系统验收，识别效果会受光照、摄像头和手的位置影响。

## 没有摄像头？先看演示

装好之后（见下一节），打开这两个地址不需要摄像头：

- `http://localhost:5173/?spellDemo=1`：自动演示坤、巽、震、坎四种术式
- `http://localhost:5173/?demo=1`：只看阵盘动画

## 安装与运行 / Quick start

需要 Node.js `^20.19.0` 或 `>=22.12.0`。

```bash
git clone https://github.com/andre3056726173-oss/fenghou-qimen-gesture-simulator.git
cd fenghou-qimen-gesture-simulator
npm install
npm run dev
```

打开终端里显示的地址（默认 `http://localhost:5173`），允许浏览器使用摄像头。推荐 Chrome 或 Edge。

首次 `npm install` 会从 Google 官方地址下载约 7.5 MB 的手部识别模型，之后都用本地副本。下载失败时检查网络，再运行一次 `npm install`。

## 怎么玩 / Controls

一只手就能走完一轮：**张掌召阵 → 指向一个宫位 → 捏合定宫 → 等蓄势完成 → 做对应动作施术 → 握拳收阵**。

| 手势 | 作用 |
|---|---|
| 张开手掌 | 召唤阵盘 |
| 握拳 | 短握：取消准备中的术式；长握：收起阵盘 |
| 只伸食指指向 | 选择宫位 |
| 拇指食指捏合 | 指向宫位时：锁定宫位；否则：抓住一层盘，转手腕来拨动 |
| 双手同时捏合 | 移动整个阵盘 |
| 双手张开并拉开距离 | 放大阵盘，拉得更远会让四层盘分开 |

锁定宫位后，等术式蓄势完成，再做对应动作：

| 宫位 | 术式 | 发动动作 |
|---|---|---|
| 坤 | 土 | 手掌往前轻推 |
| 巽 | 风 | 手掌左右横扫 |
| 震 | 雷 | 捏合保持一下再快速张开手指 |
| 坎 | 水 | 手掌往身体方向回拉 |

每个手势都要保持稳定一小会儿才会被认出来。更细的说明见 [手势文档](docs/GESTURES.md)。

## 常见问题 / FAQ

**找不到摄像头？** 程序会自动排除名字里带 `virtual`、`obs`、`capture`、`screen`、`phone`、`redmi`、`nvidia`、`broadcast` 的设备（虚拟摄像头、手机摄像头之类），并优先使用名字里带 `USB Webcam` 的设备。如果你只有这类摄像头，目前会提示「未找到可用的实体 RGB 摄像头」。

**隐私：** 摄像头画面只在本机浏览器里交给 MediaPipe 识别，本项目不上传视频。MediaPipe 自身的数据处理见其 [官方隐私说明](https://github.com/google-ai-edge/mediapipe#privacy-notice)。

## 调试 / Debug

- `?showcase=1`：隐藏所有界面的纯展示；加上 `&background=camera` 会用摄像头画面当背景（不识别手势）。
- 摄像头模式下加 `?qa=1`，按 `D` 打开调试面板：
  - `C`：个人手势校准，结果保存在当前浏览器
  - `R`：录制最长 10 秒的手势数值（JSON）
  - `T`：开始/结束最长 60 秒的 QA 记录（JSON）
  - `1`–`4`：模拟施术，只用来看视觉效果，不代表手势能被识别

导出的 JSON 不含视频，但可能有设备信息和手部坐标，分享前请检查。

## 开发 / Development

```bash
npm run typecheck
npm test
npm run build
```

技术栈：TypeScript、[Three.js](https://threejs.org/) `0.186.0`、[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) `1.0.1`、Vite `8.3.0`，版本锁定在 `package-lock.json`，不需要任何账号或 API Key。

### 项目结构

```text
src/
  app/                 摄像头会话与 URL 运行模式
  handTracking/        摄像头帧、MediaPipe、坐标映射
  gestureRecognition/  分类、平滑、状态机、动作与 QA
  qimen/               四盘、宫位、阵局动画及交互几何
  threeScene/          Three.js 场景、相机、质量与后处理
  spells/              术式生命周期、解析、视觉和镜头反馈
  effects/             阵局能量流
  audio/               音效事件接口
  showcase/            自动演示编排
  ui/                  Debug 与轻量界面
  main.ts              运行时编排
```

代码结构见 [架构导览](docs/ARCHITECTURE.md)，参与贡献见 [贡献指南](CONTRIBUTING.md)。

## Roadmap

- [x] 手部识别、悬浮阵盘、盘层交互、四种术式原型、校准与自动化测试
- [ ] 真人摄像头验收
- [ ] 手部遮挡、视觉与音效打磨
- [ ] 更完整的奇门系统与网页部署

详见 [ROADMAP.md](ROADMAP.md)。

## License 与版权声明 / Disclaimer

本仓库中由项目贡献者原创的源代码、程序化视觉实现和明确标注为原创且可授权的资源按 [MIT License](LICENSE) 提供。第三方包、字体、模型、商标和素材各自受其原有条款约束；来源与分发范围见 [ASSETS_LICENSES.md](ASSETS_LICENSES.md)。MIT 不授予任何第三方角色、商标、美术、动画、漫画、音乐、字体或其它素材的权利。

This is an unofficial, fan-made technical experiment. It is not affiliated with, endorsed by, or sponsored by the creators, publishers, studios, or rights holders of *Under One Person / Hitori no Shita / 一人之下*. The repository does not grant rights to third-party characters, trademarks, artwork, music, animation footage, or other copyrighted materials. Original source code and original procedural visual assets are licensed separately according to this repository's license.
