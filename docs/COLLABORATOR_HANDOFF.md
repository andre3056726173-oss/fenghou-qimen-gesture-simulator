# 协作者交接 · 2026-10-08

这是给首次 Clone 本项目、具备 TypeScript 基础的开发者的接手指南。先读 [项目愿景](PROJECT_VISION.md) 和 [真实现状](CURRENT_STATUS.md)：目标是通过普通 RGB 摄像头和双手操纵身前悬浮的奇门阵局，完成召阵、拨盘、指宫、捏合锁宫、READY、四术及收阵。当前为实验版本，真人交互可靠性仍需验收。

## 领取正确版本

交接分支：`handoff/current-progress-2026-10-08`，不是旧 `main`。

```bash
git clone --branch handoff/current-progress-2026-10-08 https://github.com/andre3056726173-oss/fenghou-qimen-gesture-simulator.git
cd fenghou-qimen-gesture-simulator
git branch --show-current
git rev-parse HEAD
npm ci
npm run dev
```

`npm install` 同样可用于首次安装；建议用 `npm ci` 复现已提交的锁文件。打开终端实际显示的 URL，默认 `http://localhost:5173/`。端口占用时 Vite 可能选其它端口，使用新启动进程输出的地址。

完整功能代码快照：`d729333d86a74a972d9bd08327998c269f77e889`。它包含 `0428f38` 的所有历史和本地亮度修复；随后发布的文档提交不改变此代码。包含本文的最终交接 HEAD 以发布报告完整 SHA 或 `git rev-parse HEAD` 为准；需要永久固定时，用发布报告 SHA 执行 `git switch --detach <SHA>`。

已 Clone 的开发者先保存自己的修改，再 `git fetch origin`。本地尚无交接分支时运行 `git switch --track origin/handoff/current-progress-2026-10-08`；已有该分支时直接切换并比较提交。不要 reset 覆盖个人工作。

## 环境与首次资源安装

`package.json` 要求 Node.js `^20.19.0 || >=22.12.0`；建议 Node 24 LTS。本轮实际验证 Node `v24.15.0` / npm `11.12.1`。执行 `node --version` / `npm --version` 确认环境。保持 `package-lock.json`，不要为了安装随意升级依赖。

直接依赖：TypeScript 5.9.3、Three.js 0.186.0、MediaPipe tasks-vision 1.0.1、Vite 8.3.0，具体依赖以锁文件为准。不需要账号、API Key、`.env` 或本地绝对路径配置。

`postinstall` 的 `scripts/sync-mediapipe-assets.mjs` 会：

1. 从 npm 包复制 WASM 到 `public/mediapipe/wasm/`。
2. 首次从 Google 官方存储下载 `hand_landmarker.task` 到 `public/mediapipe/models/`（约 7.5 MiB）。
3. 若已存在大于 1 MB 的模型，复用现有文件。

这些资源不在 Git 中；运行安装脚本后才能在本地使用识别。下载失败请检查 Google 存储可达性，再运行 `npm run postinstall`；不要绕过 SSL 校验。如果安装时用了 `--ignore-scripts`，需手动补运行此命令。模型下载不代表摄像头画面上传。字体首次来自 Google Fonts，字体不可达时会使用后备字体。

Chrome / Edge、localhost 或 HTTPS、WebGL 和摄像头权限为真人模式所需。默认优先实体 `USB webcam`；REDMI／Virtual／NVIDIA Broadcast 等源被排除。仅有虚拟源时当前会报找不到摄像头，这是策略限制而非硬件损坏。

## 命令与验证

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

测试使用 Node 内置 test runner 和轻量 TS loader，没有额外大框架。构建输出 `dist/`，preview 默认端口 4173。开发服务器与构建 preview 使用不同端口，注意地址。

本轮代码验证：typecheck 通过，134 项测试全通过，build 通过。300 秒语义演示测试覆盖四术阶段与对象池数量，是模拟测试，不是真人/GPU 长时间验收。隔离安装和实际浏览器冒烟结果见文末验证记录。

## 模式与按键

以下路径接在终端显示的服务器地址之后：

| 地址 | 用途 |
| --- | --- |
| `/` | 自动启动正常摄像头交互；允许浏览器权限。 |
| `/?cameraDebug=1` | 仅原始镜像视频及摄像头诊断，排查画面与叠加层。 |
| `/?qa=1` | 真人 QA；按 D 启用详细 Debug。 |
| `/?qa=kun`、`/?qa=xun`、`/?qa=zhen`、`/?qa=kan` | 对应术式专项诊断，仍是真实摄像头。 |
| `/?qa=spells` | 四术简洁状态提示；D 展开/收起详情。 |
| `/?demo=1` | 无摄像头阵局演示。 |
| `/?spellDemo=1` | 无摄像头固定节奏：召阵、拨盘、定宫、四术、收阵。 |
| `/?showcase=1` | 无摄像头、隐藏 UI 的自动展示。 |
| `/?showcase=1&background=camera` | 展示使用摄像头背景，但不接真实手势控制。 |

Debug 下 C 开始个人校准，R 开始/结束最长 10 秒数值录制，T 开始/结束最长 60 秒 QA；数字 1–4 为视觉模拟施术。它们不代表真人链验证。正常模式没有技能按钮。校准保存在当前浏览器的 `qimen.gestureCalibration`；不同端口／浏览器可能使用不同存储。

## 真人测试应该看什么

先打开 `?qa=spells`，检查左上 BUILD 的分支与 SHA。普通 `main` 缺少后续 Target/Lock 和四术准入，不要用它测试当前修复。

张掌召阵 → 食指尖移动到目标宮 → 看到「预览／已瞄准」和 Armed → 食指自然弯曲与拇指捏合 → 右上「锁定宫位：某宫 · LOCKED」→ 蓄势 → READY。

CURRENT PALACE 或预览高亮不等于 Lock；POINT 消失不应立即取消 Armed。目标 Armed 后应使用新捏合，不要求 POINT 和 PINCH 同时成立。无 Armed Target 时捏合仍用于操盘。

锁宫后完全松开，坤／巽／坎重新张掌稳定，等「可以施法」后执行新 PUSH／SWIPE／PULL；震在 READY 后重新捏合蓄势，再快速分离拇指食指。锁宫释放、自然回位和 READY 前动作不能算施术。

若没有进入 PREPARING，不要先调动作阈值：先查 rayHit、Preview、Focus、Armed、pinch down edge、Lock 是否成功。T 报告必须有 `targetSelection` 和 `targetTimeline`；缺失意味着旧版本／QA schema 未激活。录制只保存数值，没有视频，但含设备和手部坐标，审阅后才私下分享，不提交仓库。

## 目录与负责文件

```text
src/app/                 摄像头会话、URL 模式
src/handTracking/        MediaPipe、帧身份、坐标映射
src/gestureRecognition/ 手形、时序、编排、选宫、施术准入、校准、QA
src/qimen/               阵盘几何、宫位、四盘、动画、拾取
src/spells/              定义、生命周期、视觉对象池、镜头反馈
src/threeScene/          场景、手空间、相机、质量、后处理、生命周期
src/effects/             阵局能量流
src/audio/               分类音频事件接口
src/showcase/            语义演示导演
src/ui/                  提示、Debug、timeline、专项 trace
tests/                   纯逻辑、几何、四术与 Target/Lock 测试
scripts/                 安装资源与 TS 测试加载器
```

| 工作领域 | 入口与职责 |
| --- | --- |
| 摄像头／镜像 | `app/CameraSession.ts`、`handTracking/CameraCoordinates.ts`；不要在下游再次手工镜像。 |
| 手势分类／稳定 | `GestureRecognizer.ts`、`GestureSmoother.ts`、`FrameSampleGate.ts`、`HandTracker.ts`。 |
| Target/Lock | `TargetSelectionController.ts`、`TargetLockPinchDetector.ts`、`QimenScene.pointingHit`、`FormationPicking.ts`；`main.ts` 实际使用新 TargetSelection，不是旧 `SectorFocusController`。 |
| 交互准入 | `GestureStateMachine.ts`、`GesturePriorityResolver.ts`、`GestureChoreographyController.ts`。 |
| 运动证据 | `GestureMotionDetector.ts`、`HandSwipeDetector.ts`；动作检测不等于 CAST 许可。 |
| 四术准入 | `RealSpellCastGate.ts` 唯一路由；坤 `ReadyMotionCastController(PUSH)`，巽 `XunCastInputController`，震 `ZhenFlickController`，坎 `KanPullController`。 |
| 权威术式 Lock/Stage | `SpellCastController.ts`，由 `SpellSystem.ts` 暴露；Formation 和 Target 显示字段不是它的替代。 |
| 阵局与空间 | `QimenFormation.ts`、Earth/Human/Heaven/SpiritPlate、`FormationAnimator.ts`、`FormationStyle.ts`、`HandSpaceController.ts`。 |
| 特效与性能 | `SpellVisuals.ts`、`SpellVisualConfig.ts`、`VisualQualityConfig.ts`、`PostProcessingPipeline.ts`、`PerformanceGovernor.ts`。 |
| QA 与 UI | `RealInteractionQA.ts`、`GestureDebugRecorder.ts`、`DebugOverlay.ts`、`Hud.ts`、`InteractionEventTimeline.ts` 与各术 trace。 |
| 演示／声音／预留遮挡 | `SpellDemoDirector.ts`、`AudioEventBus.ts`、`HandOcclusionSystem.ts`。 |

运行链为 Camera→新 MediaPipe sample→分类与稳定→Target Selection／运动证据→Cast Gate与Priority→交互事件→Formation和Spell生命周期→视觉／相机／后处理→Render。`main.ts` 负责串联；不要再给每术添加一条独立平行 CAST 入口。

## 优先级与协作边界

P0 可复现安装、Demo、依赖通告；P1 真人 Target/Lock；P2 按数据修延迟／丢目标／捏合抢占；P3 明确 Lock/READY 反馈；P4 同一阵局四术连续测试；P5 才是遮挡、声音、电影级视觉。

文档、独立测试和只读诊断可按文件并行分工；以后视觉配置／音频资产可另开 PR，但先协商资源与状态边界。当前不要先扩术法或大改 Shader。

容易冲突的共享文件：`main.ts`、`GestureMotionDetector.ts`、`GestureStateMachine.ts`、`GesturePriorityResolver.ts`、`RealSpellCastGate.ts`、`QimenScene.ts`、`SpellSystem.ts`、`runtimeMode.ts`、Recorder/QA、`styles.css` 和 README。提前说明 ownership，逐处合并语义，不能盲目 ours/theirs。

不要再次 merge/cherry-pick 已经是祖先的巽、震、坎修复。历史独立审计在 `chore/pre-integration-audit`，供参考；交接分支已经具有当前整合测试。

手势默认阈值、Focus/PINCH timing、Armed 700ms、权重、Input Buffer、Grace 和 hysteresis 保持冻结。确需修改时，PR 说明设备、摄像头、光照、距离、测试次数、成功率、误触及前后对照；模拟 Demo 不够。

## 开自己的分支和 PR

```bash
git switch handoff/current-progress-2026-10-08
git switch -c fix/your-task
# 修改后验证
npm run typecheck
npm test
npm run build
git add <explicit-reviewed-files>
git commit -m "fix: describe your change"
git push -u origin fix/your-task
```

没有仓库写权限的朋友先 Fork，在自己的 Fork 中提交分支。PR 的 base 选择本次交接分支，便于在最新代码上协作；正式进入 main 的整合需项目负责人批准。本次交接到 main 的 PR 只能保持 Draft，不自动 Merge。

遵循 [CONTRIBUTING.md](../CONTRIBUTING.md) 和 [ASSETS_LICENSES.md](../ASSETS_LICENSES.md)。不提交 `.env`、secret、个人路径、原始 QA、真人录像、缓存、dist、node_modules 或授权不明素材。

## 本轮验证记录

已在原项目和干净的隔离 Clone（代码快照 `d729333`）完成锁文件安装、typecheck、134/134 测试、build；隔离 Clone 首次实际下载 7,819,105 字节 MediaPipe 模型，工作区保持 clean。没有新增功能或调整真人参数。

隔离生产构建的 `?spellDemo=1` 与 `?showcase=1` 浏览器冒烟检查能渲染阵盘，无 console error，不请求摄像头；Showcase 隐藏提示和锁定状态。完整四术周期的逻辑验证另由模拟测试覆盖，浏览器冒烟不等于真人交互或全面视觉验收。

已知依赖通告及真人未验收事项详见 [CURRENT_STATUS.md](CURRENT_STATUS.md)。不要把「交接代码能安装和构建」解释成「真人交互已经完成验收」。
