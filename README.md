# Fenghou Qimen Gesture Simulator · 风后奇门手势交互模拟器

A real-time gesture-controlled Qimen formation experiment built with MediaPipe, Three.js and WebGL.

通过电脑摄像头识别手部动作，在浏览器中召唤、拨动并操纵一个正面悬浮的原创程序化奇门圆阵。这是正在开发的交互实验，真人准确率尚未验收。摄像头画面由浏览器本地交给 MediaPipe 处理；本项目代码不上传视频帧。关于 MediaPipe SDK 自身的数据处理，请参阅其[官方隐私说明](https://github.com/google-ai-edge/mediapipe#privacy-notice)。

## 当前功能 / Features

- 双手实时识别；单手张掌召阵、握拳收阵。
- `FRONT_CIRCLE` 悬浮四盘；盘层 Hover、捏合抓取、转腕、惯性与 45° 吸附。
- 八宫 Preview / Focus / Lock；双手缩放、抓取空间位置与盘层分离。
- 四种实验术式：坤·土、巽·风、震·雷、坎·水。术式由定宫和后续动作触发。
- 可选个人手势校准、数值录制、真人 QA 记录、性能档位与 Debug 面板。
- 纯阵局、四术自动演示和无界面 Showcase 模式。

当前手部遮挡接口尚未接入真实分割；实际识别率、延迟和五分钟 GPU 稳定性仍需真人摄像头验收。详见 [Roadmap](ROADMAP.md) 与 [架构审计](docs/ARCHITECTURE_AUDIT.md)。

## 技术栈 / Stack

TypeScript、[Three.js](https://threejs.org/) `0.186.0`、[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) `1.0.1`、WebGL、Vite `8.3.0`。依赖版本锁定在 `package-lock.json`；没有账号、API Key 或环境变量要求。

## 快速开始 / Quick start

需要 Node.js `^20.19.0` 或 `>=22.12.0`、npm 和首次安装时的网络连接。

```bash
git clone https://github.com/andre3056726173-oss/fenghou-qimen-gesture-simulator.git
cd fenghou-qimen-gesture-simulator
npm install
npm run dev
```

打开终端显示的本地地址。首次 `npm install` 会把 MediaPipe WASM 从 npm 包复制到 `public/mediapipe/wasm/`，并从 Google 官方地址下载约 7.5 MB 的 Hand Landmarker 模型到 `public/mediapipe/models/`。这些生成文件不提交到 Git；以后启动使用本地副本。下载失败时检查网络连接，然后重新运行 `npm install`。

构建和验证：

```bash
npm run typecheck
npm test
npm run build
```

摄像头模式需要浏览器 Camera 权限，以及 `localhost` 或 HTTPS 安全上下文。建议使用当前版本 Chrome 或 Edge；需 WebGL。没有摄像头也可使用下述演示模式。

## 操作 / Controls

| 动作 | 当前用途 |
|---|---|
| 张掌 `OPEN_PALM` | 从掌心召唤阵局；双手张开并拉开可放大、分离盘层 |
| 捏合 `PINCH` + 转腕 | 抓取并拨动一层盘；双手同时捏合可移动整个阵局 |
| 伸食指 `POINT`，随后捏合 | 预览并锁定所指宫位 |
| `PUSH` / `SWIPE` / 捏合后快速松开 `FLICK` / `PULL` | 分别尝试发动坤 / 巽 / 震 / 坎 |
| 短握拳 / 长握拳 `FIST` | 取消准备中的术式 / 收阵 |

定宫后需等待术式蓄势到 `READY`；真实摄像头的识别效果因光照、设备和手位而异。完整说明见 [手势文档](docs/GESTURES.md)。

## 演示与调试 / Demo & Debug

- `?demo=1`：纯阵局动画；`?spellDemo=1`：固定节奏演示坤、巽、震、坎，均无需摄像头。
- `?showcase=1`：隐藏调试 UI 的纯背景演示；`?showcase=1&background=camera`：以摄像头作背景，但不把它用作手势输入。
- 正常摄像头模式加 `?qa=1`，再按 `D` 打开 Debug。`T` 开始/结束最长 60 秒的 QA JSON 会话；`R` 记录最长 10 秒的手势数值 JSON；`C` 运行个人校准。
- Debug 下数字键 `1`–`4` 是开发用模拟施术，不能用于真人成功率统计。Debug 参数面板中的保存会修改浏览器本地个人参数。

QA JSON 和手势数值记录不包含视频，但可能包含设备信息和手部坐标，默认被 `.gitignore` 排除；分享报告前请自行检查。

## 项目结构 / Structure

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

贡献者可从 [架构导览](docs/ARCHITECTURE.md)、[手势文档](docs/GESTURES.md) 和 [贡献指南](CONTRIBUTING.md) 开始。

## Roadmap

- [x] Hand Tracking、悬浮阵、盘层交互、四术原型、校准与自动化审计
- [ ] 真人摄像头 QA 达标
- [ ] 真实手部遮挡、电影级视效与音效
- [ ] 更完整的奇门系统与 Web 部署

详细阶段和验收边界见 [ROADMAP.md](ROADMAP.md)。

## License 与版权声明 / Disclaimer

本仓库中由项目贡献者原创的源代码、程序化视觉实现和明确标注为原创且可授权的资源按 [MIT License](LICENSE) 提供。第三方包、字体、模型、商标和素材各自受其原有条款约束；来源与分发范围见 [ASSETS_LICENSES.md](ASSETS_LICENSES.md)。MIT 不授予任何第三方角色、商标、美术、动画、漫画、音乐、字体或其它素材的权利。

This is an unofficial, fan-made technical experiment. It is not affiliated with, endorsed by, or sponsored by the creators, publishers, studios, or rights holders of *Under One Person / Hitori no Shita / 一人之下*. The repository does not grant rights to third-party characters, trademarks, artwork, music, animation footage, or other copyrighted materials. Original source code and original procedural visual assets are licensed separately according to this repository's license.
