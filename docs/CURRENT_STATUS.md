# 当前状态与证据 · 2026-10-08

本报告基于代码、Git 历史和本轮验证。设计目标见 [PROJECT_VISION.md](PROJECT_VISION.md)。**自动化通过不等于真人锁宫或施法达到目标成功率。**

## 交接版本与历史

交接分支：`handoff/current-progress-2026-10-08`。

来源是 `fix/target-focus-lock-flow` 的 `0428f38245c31f7113a807c38b33fde65a6bdc0c`，加上已审查的本地摄像头预览亮度修复。完整功能代码快照是 `d729333d86a74a972d9bd08327998c269f77e889`；之后的交接文档提交不改变该源码。分支最终发布 HEAD 用 `git rev-parse HEAD` 查看，并在发布报告中给出完整 SHA。

| 历史节点 | 提交 | 状态 |
| --- | --- | --- |
| 稳定 `main` / 坤链 | `e1084b3bbe46d2d8b51fa8fecb193de9a125db39` | 仍保留；落后于交接源码。 |
| 巽独立链 | `abfdb974294501b9d9b1dbfe8071262cd97e96cf` | 已是交接分支祖先。 |
| 震独立链 | `df145fd3558a6968dbfab35b31f52955ac0d929a` | 已是交接分支祖先。 |
| 坎独立链 | `e402db11e310645a4e14151cffb11364c5064771` | 已是交接分支祖先。 |
| 四术整合 | `a395fec89b301c723426fa006d4baf480387b177` | 保留三个 merge 及统一 Cast Gate。 |
| Target/Lock 初版 | `3e703e7f62c5257e3018ca412fe891a83d0dd7ec` | 建立在四术整合之上。 |
| 后续 Target/Lock | `31e671b` → `0428f38` | Hybrid Screen Targeting、明确锁定 UI、QA schema 和隐藏未激活警告。 |
| 摄像头可见度修复 | `d729333` | 保留人像原始亮度、透明叠加阵法、减轻暗角。 |

`chore/pre-integration-audit`（`285f547`）是从旧 main 出发的独立审计产物，只有 `INTEGRATION_PLAN.md` 和 `tests/pre-integration-harness.test.mjs`，没有独立功能源码。本轮不重复合并它；其测试针对旧 main／旧 Focus 接口，当前分支已有专门四术与 Target/Lock 测试。可在 [该分支](https://github.com/andre3056726173-oss/fenghou-qimen-gesture-simulator/tree/chore/pre-integration-audit) 查阅历史结论，不把旧版说明当作当前版本。

检查时未发现 merge、rebase、cherry-pick 或 revert 中断；本地唯一未提交源码就是亮度修复，已纳入交接历史。没有覆盖任何历史分支，也没有合并到 main。

## 已实现，但真人整体验收未完成

- 本地 MediaPipe Hands、实体 RGB 摄像头选择、统一镜像与裁剪映射、新样本门控。
- `FRONT_CIRCLE` 正面悬浮阵；掌心召阵、收阵；四盘 Hover/Grab/Rotate/Inertia/Snap、双手 Scale/Grab/Split。
- `TargetSelectionController` + `TargetLockPinchDetector`：两个新样本预览、动态 100/150/200ms dwell、Armed 默认 700ms、新捏合周期锁定。
- FRONT_CIRCLE 以食指尖屏幕射线为主要瞄准来源；Aim Cursor、独立目标／锁定／术式 UI、Target Lock 防抢占断言和 QA schema 自检。
- `RealSpellCastGate` 统一四术真人准入；只有当前 Locked + READY 术式控制器允许确认新动作。
- 坤新 PUSH、巽新定向 SWIPE、震新捏合蓄势后 FLICK、坎松开锁宫与 READY Neutral 后新 PULL。
- 摄像头模式、各专项 QA、数值录制、个人校准、Debug tuning、性能分档与视觉参数集中配置。
- 无摄像头阵局演示、四术自动演示和 Showcase。
- 术法对象池、资源 dispose、监听器生命周期、音频事件接口。

默认动作阈值仍为 PUSH 0.42、PULL 0.42、SWIPE 0.12、FLICK 1.1。已有浏览器个人校准可能覆盖默认值；本轮没有修改阈值、权重、时序或状态机。

## 自动测试证据

本轮在 Node.js `v24.15.0` / npm `11.12.1` 上完成：

| 验证 | 结果与范围 |
| --- | --- |
| 锁文件安装 | `npm ci --cache .npm-cache` 成功，postinstall 的本地 MediaPipe 资源检查成功；缓存选项仅为本机受限目录适配，不是项目运行要求。 |
| 类型检查 | `npm run typecheck` 通过。 |
| 测试 | `npm test`：134 项通过，0 失败、0 跳过。 |
| 构建 | `npm run build` 通过；仍有大于 500 kB 的 JS chunk 提示。 |
| 无摄像头逻辑演示 | 测试使用 300 秒模拟时钟，覆盖四术生命周期及热池对象数量不增长；不是实际 GPU 连跑五分钟。 |

覆盖包含：Target Armed 跨 POINT→PINCH 保留、锁宫优先、旧捏合不能穿透、stale/lost sample、四术交叉误动作、READY 边界、方向镜像、变换拾取、资源 reset/dispose 和 QA schema。部分测试是纯逻辑／模拟对象，不包含浏览器实摄像头与实际手部输入。

另在干净的隔离 Clone（代码快照 `d729333`，没有已有模型）重复验证安装、类型检查、134 项测试和构建，全部通过；postinstall 实际从 Google 官方源下载 7,819,105 字节模型。生产构建的 `?spellDemo=1` 和 `?showcase=1` 浏览器冒烟检查能渲染阵盘，未发现 console error，未打开摄像头；Showcase 隐藏提示和锁定 UI。这里只是启动／渲染检查，不是完整视觉美术验收或真人 QA。

## 真人测试确认与未确认

已有会话的直接观察确认：选定实体摄像头后能显示用户本人；亮度修复后视频为 1280×720、ReadyState 4、opacity 1、filter none，镜头背景可见。这只确认当时设备上的摄像头预览，不证明所有设备兼容。

历史真人测试暴露：POINT/PINCH 高置信但 Focus/Lock 未成功，PINCH 进入抓盘／转盘，Armed false、Spell NONE；还有张掌被误收阵的记录。后续存在对应代码修复和自动测试，但没有足够的当前版本真人连续试验来证明已达标。

目前不能给出：锁宫 90% 成功率、四术各 8/10 成功率、物理手到画面延迟，或当前版本真实摄像头五分钟稳定性。没有把私人 QA JSON 或录像重新发布为证据。

## 已知限制与需要重验的问题

1. **P1：Target/Lock 真人可靠性仍未验收。** 用 Build Fingerprint 核对实际交接分支，再观察 Preview→Armed→Lock、`targetSelection` 与 `targetTimeline`，避免继续测试旧 main。
2. **P2：状态边界需真人重验。** Target、Formation 的显示锁定与 `SpellCastController.lockedSector` 是不同层；换手、重定宫、取消、短暂丢手时要核对权威 lock 与 UI 是否一致。不能仅由 CURRENT PALACE 判断锁定。
3. **P3：四术连续操作需真人重验。** READY 后必须重新 Neutral/Arm；小动作成功率和非施术误触都缺少当前版本统计。
4. 摄像头策略排除虚拟／手机／Broadcast 等源，只有这类源的电脑可能无法使用；GPU 手部模型初始化也没有完整跨设备兼容验收。
5. 外部 Google Fonts、首次模型下载需要网络；已有模型会复用，源码本身不需要 API Key 或环境变量。
6. **开发依赖通告：** 本轮 `npm audit` 报 `source-map-js@1.2.1` 高危源映射拒绝服务通告 [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。链路为 Vite→PostCSS→source-map-js；`npm audit --omit=dev` 本轮为 0。本轮保持锁文件，未自动 `audit fix`。应另开依赖修复 PR 验证升级，不把审计为零当作永远安全。

## 接口已预留，尚未完成的效果

`HandOcclusionSystem` 目前没有真实 mask／分割；`AudioEventBus` 是分类事件接口，没有正式声音资产。Bloom 已接入，PostProcessingPipeline 的 chromatic aberration、vignette、distortion、exposure pulse、radial blur 为预留能力；motion blur 配置不等于实际 pass。CSS 暗角和现有术式材质表现也不等于这些未来 pass 已完成。

其它四宮、完整奇门规则、组合术式、正式部署、电影级视效和录屏产品流程尚未完成。

## 朋友接手的优先级

P0 安装、启动、Demo 和依赖通告处理 → P1 正确版本的真人 Target/Lock QA → P2 按证据修复前置链 → P3 验证 Lock/READY 反馈 → P4 四术连续真人验收 → P5 遮挡、深度、声音和电影级视觉。

未经真人证据，不修改动作阈值、Calibration、Input Buffer、Grace、Hover/Sector hysteresis 和真人平滑时序。
