# Contributing / 参与开发

欢迎修复缺陷、改善交互与视觉、补充测试和文档。项目目前有四个实验术式；新增术式前请先讨论需求和性能预算。请勿提交动漫原画、角色、音乐、漫画画面或来源不明的素材；新增可分发资源时更新 [ASSETS_LICENSES.md](ASSETS_LICENSES.md)。

## 开发流程

先 Fork 或 Clone 仓库，使用符合范围的分支名：`feature/*`、`fix/*`、`visual/*`、`gesture/*`、`spell/*`、`performance/*`、`docs/*`。

```bash
git clone https://github.com/andre3056726173-oss/fenghou-qimen-gesture-simulator.git
cd fenghou-qimen-gesture-simulator
git checkout -b fix/example
npm install
# 修改并验证
npm run typecheck
npm test
npm run build
git add <changed-files>
git commit -m "fix: describe the change"
git push -u origin fix/example
```

然后向项目主分支提交 Pull Request。推荐提交前缀：`feat:`、`fix:`、`refactor:`、`perf:`、`docs:`、`test:`。PR 请说明动机、改动范围、测试方式；视觉改动可附只包含你有权发布内容的截图或视频。

## 手势参数需要真人证据

未经真实摄像头测试，请勿凭感觉修改 PUSH / PULL / SWIPE / FLICK 阈值、Gesture Calibration、Input Buffer、Grace Period、Plate Hover Hysteresis、Sector Hysteresis 或默认平滑参数。修改这些参数的 PR 至少说明：设备与摄像头、光照与距离、所做动作及次数、成功率、误触情况，以及前后差异。可使用 `?qa=1`、Debug 下的 `T` 会话与 `R` 数值记录定位问题；键盘 `1`–`4` 的模拟术式不能作为真人成功率证据。QA 数值可能含设备标识和手部坐标，请先审阅再分享，且不要提交原始录像。

先阅读 [架构导览](docs/ARCHITECTURE.md)、[手势说明](docs/GESTURES.md) 和 [Roadmap](ROADMAP.md)。公共 API 或状态所有权变化应附针对跨模块行为的测试，避免只验证单个文件的内部实现。

提交贡献即表示你有权授权所提交内容，并同意按本仓库 [MIT License](LICENSE) 授权原创贡献；第三方内容仍遵循其原许可证。使用他人内容时请在 PR 说明来源与授权，不要把第三方素材当作自己的 MIT 作品。
