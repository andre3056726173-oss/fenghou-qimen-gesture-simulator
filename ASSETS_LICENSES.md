# Assets and third-party licenses / 素材与第三方许可

仓库 MIT 许可证仅涵盖贡献者有权授权的原创内容；以下第三方资源不会因仓库使用 MIT 而转为 MIT。审计范围为当前 `src/`、`index.html`、`public/` 和项目根目录。源码依赖的完整传递许可也应以各 npm 包的实际许可证为准。

| 文件或资源 | 来源 / 作者 | 许可或状态 | 本仓库分发 |
|---|---|---|---|
| 阵纹、八宫文字布局、太极、粒子、Canvas 纹理、页面内 SVG favicon（由 `src/` 和 `index.html` 生成） | 本项目贡献者原创程序化实现 | 仓库 [MIT](LICENSE)，仅在贡献者拥有相应权利的范围内 | 是：分发源码；运行时生成图形 |
| `public/mediapipe/wasm/*` | Google MediaPipe，随 `@mediapipe/tasks-vision@1.0.1` npm 包取得 | 包元数据标记 [Apache-2.0](https://www.npmjs.com/package/@mediapipe/tasks-vision)；保留上游权利与通知 | 否：`npm install` 的 postinstall 从已安装 npm 包复制到本地 |
| `public/mediapipe/models/hand_landmarker.task` | Google MediaPipe [Hand Landmarker 模型](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)，[官方示例地址](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md) | **模型包单独再分发条款未获明确核实**；不得视作本仓库 MIT 内容 | 否：postinstall 从 Google 官方存储地址下载到本地；发布前如计划将模型随仓库或站点一同分发，须单独核实授权 |
| `Noto Serif SC`（`src/styles.css` 的 Google Fonts 请求） | Google / Adobe；[Google Fonts 元数据](https://github.com/google/fonts/blob/main/ofl/notoserifsc/METADATA.pb) | SIL Open Font License 1.1；字体本体仍归原作者 | 否：运行时从 Google Fonts 请求，字体不可用时 CSS 使用后备字体 |
| `Rajdhani`（`src/styles.css` 的 Google Fonts 请求） | Indian Type Foundry；[Google Fonts 元数据](https://github.com/google/fonts/blob/main/ofl/rajdhani/METADATA.pb) | SIL Open Font License 1.1；字体本体仍归原作者 | 否：运行时从 Google Fonts 请求，字体不可用时 CSS 使用后备字体 |
| 根目录 `preview*.png` | 既有本地开发预览截图；本次目视检查显示为本项目网页画面，未见真人或动漫贴图 | 生成过程/外部使用授权不作为发布所需素材确认 | 否：保留本地文件，由 `.gitignore` 排除 |

当前未发现音频、视频、外部 3D 模型、动漫截图、角色立绘、漫画页面或第三方贴图进入拟提交清单。将来新增图片、字体、声音、模型或录屏时，PR 应在此记录来源、作者、许可与再分发条件；来源不明的文件不要提交。
