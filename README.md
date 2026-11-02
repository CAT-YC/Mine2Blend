# Mine2Blend

> 把《我的世界》投影一键导入 Blender 的玩家工具

![version](https://img.shields.io/badge/version-0.5.6%20beta-orange)
![blender](https://img.shields.io/badge/Blender-4.2%20LTS%2B-f5792a)
![platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078d6)
![license](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)

**Mine2Blend** 是面向 MC 玩家、动画师和教程创作者的 Blender 插件，用于把《我的世界》建筑投影直接导入 Blender，自动还原方块几何与材质，方便做渲染、动画和教程。

插件内置一套离线转换器，**无需手动安装 Node.js、也不依赖任何在线服务或服务器**——选中投影文件即可在本机完成转换并导入。

> ⚠️ 当前为 **0.5.6 内测版**，仅提供 Windows 10 / 11 x64 运行时，欢迎在 Issues 反馈问题。

![Mine2Blend 导入演示](assets/demo-import.gif)

> 🎬 演示：选中 `.litematic` / `.schem` 投影文件，一键导入 Blender 并自动还原方块几何与材质。

---

## ✨ 功能特性

- **多格式导入**：支持 `.litematic` 与 Sponge `.schem`（v2 / v3）两种主流投影格式
- **离线转换**：内置 Windows x64 转换器 runtime，导入全程在本机完成，无需联网、无需配置环境
- **材质还原**：自动处理贴图采样、透明、玻璃、水、植物裁切与 tint 染色，叶子 / 草类缺色时有默认兜底
- **多建筑共存**：不同建筑各自独立子集合、可自动并排，导入新建筑不会覆盖已导入的
- **投影管理面板**：已导入投影一行一个，可一键隐藏 / 删除 / 清空
- **诊断信息**：方块数、尺寸、材质数、面数、耗时、性能提示、材质审计一目了然
- **网站快捷入口**：一键打开 MCBlock 建筑库、网站在线编辑器和说明页

## 🧱 支持的格式

| 格式 | 状态 |
|------|------|
| `.litematic`（Litematica） | ✅ 已支持 |
| `.schem`（Sponge v2 / v3） | ✅ 已支持 |
| `.schematic`（旧版 MCEdit，数字方块 ID） | ⛔ 暂不支持 |
| `.nbt`（结构方块） | ⛔ 暂不支持 |

## 💻 系统要求

- **操作系统**：Windows 10 / 11 **x64**（暂未提供 macOS / Linux runtime）
- **Blender**：4.2 LTS 或更高（已在 5.1.2 实机验收）

## 📦 安装（玩家）

1. 在本仓库 [Releases](https://github.com/CAT-YC/Mine2Blend/releases) 页面下载最新的 `Mine2Blend.zip`（约 37 MB，内含转换器 runtime）。
2. 打开 Blender，进入 `Edit > Preferences > Get Extensions`（或 `Add-ons > Install from Disk`）。
3. 选择下载的 `Mine2Blend.zip` 安装并启用 **Mine2Blend**。
4. 在 `3D 视图 > 侧栏（N 键）> MCBlock` 找到插件面板。
5. 在「导入投影」中选择 `.litematic` / `.schem` 文件，点击导入。

> 💡 GitHub 仓库里的源码**不含**转换器运行时（`node.exe` / `node_modules`），所以请从 Releases 下载打包好的 `Mine2Blend.zip` 安装，而不是直接 clone 源码安装。

## 🛠️ 从源码构建（开发者）

本仓库为**纯源码仓**，刻意不收录第三方运行时二进制（`node.exe` 约 67 MB + `node_modules` 约 26 MB），以保持仓库轻量。构建可运行的插件包需要先补齐运行时：

1. clone 本仓库。
2. 进入转换器目录，按锁文件还原依赖，并放入一个 Windows x64 的 Node 运行时：
   ```bash
   cd resources/converter/win-x64
   npm ci          # 依据 package-lock.json 还原 node_modules
   # 再放入一个 Windows x64 的 node.exe 到本目录
   ```
3. 回到仓库根，运行打包脚本：
   ```bash
   python build_zip.py
   ```
   产物为 `dist/Mine2Blend.zip`，内部顶层会自动包成 `mcblock_mine2blend/` 包目录（Blender 安装所需），并通过结构自检。

> 📌 源码在仓库根是扁平铺开的，方便浏览；但 Blender add-on 安装包要求顶层是 `mcblock_mine2blend/` 包目录，因此请**用 `build_zip.py` 打包**，不要直接把仓库根压成 zip 安装。

### 仓库结构

```text
Mine2Blend/                          # 仓库根 = 插件源码（扁平）
├── README.md
├── .gitignore
├── build_zip.py                     # 打包脚本（自动包成 mcblock_mine2blend/ 安装包）
├── blender_manifest.toml            # 扩展清单（Blender 4.2+）
├── __init__.py
├── preferences.py
├── properties.py
├── core/                            # 转换桥接、材质、导入、诊断
├── operators/                       # 导入 / 材质 / 网站 / 诊断算子
├── panels/                          # N 面板 UI
└── resources/converter/win-x64/
    ├── src/batch-obj-export.mjs     # 转换器源码
    ├── package.json / package-lock.json
    ├── mcblock-litematic-converter.cmd
    └── assets/mcmeta/               # 方块定义 / 模型 / 贴图图集
    #   node.exe 与 node_modules 不在 git 中，构建时按上面步骤补齐
```

## 🌐 相关链接

- 插件说明页：<https://mcblock.top/blender>
- MCBlock 建筑库与网站在线编辑器：<https://mcblock.top>

## 📄 许可

本插件以 **GPL-3.0-or-later** 许可发布，版权 © 2026 MCBlock。

插件不包含《我的世界》游戏本体；`assets/mcmeta/` 下的方块定义与贴图数据仅用于在本机离线还原投影的几何与材质。Minecraft 是 Mojang Studios 的商标，本项目与 Mojang、Microsoft 无隶属关系。

## 0.5.4 本地开发候选（未发布）

本地源码已接入透明接触局部裁切、植被双面UV和独立发光贴图，区分炼药锅水面与锅身，修正浮冰/蓝冰透明分类并清理零面积面。同名重导先完成新模型校验再替换，失败保留原模型。

几何修复需要重新导入投影，已有 `.blend` 不会因“修复材质”自动重建网格。新OBJ旁的同名 `.surfaces.json` 应与OBJ一同保留，旧OBJ仍兼容。当前0.5.4仅为本地候选，未更新公开安装包或Release；本轮实际环境为Blender5.1.2，4.2设备和用户工程仍待验收。

包内 `tests/blender_projection_safety.py` 可在独立Blender后台进程中验证真实ZIP、两种投影格式、失败回滚及多投影清理；参数见文件头。

## 0.5.5 本地开发候选（未发布）

旗帜底纹与图案按顺序合成独立布料贴图，避免多层透明几何耗尽Cycles透明反弹而发黑；保留正反UV、染色、旗杆和朝向。导入时内嵌新布料图，重导清缓存后仍可保存重开，不改用户场景反弹参数。

需要安装新插件后重新导入投影。当前仅本地候选，已提供的0.5.4安装包保持不变；用户原工程与Blender4.2设备待验，未更新网站或Release。上面的0.5.4候选段落为当时的开发记录，发布状态以网站实际版本为准。

## 0.5.6 本地候选更新

- 按实际接触面与贴图不透明区域裁切玻璃，修复海晶灯、竹块、下界疣块以及墙、栅栏、门、活板门、雪层等同类接缝。
- 保留未遮挡的玻璃、树叶/活板门等贴图孔洞和对应UV；不同颜色玻璃、水与玻璃等不同透明介质保留边界。
- 保持邻块几何及双面薄片的原有顺序；不修改Cycles透明反弹参数。
- 极端碎片贴图、无效或非矩形UV保守保留原面，避免错误裁掉透明部分；不宣称覆盖所有自定义资源包。
- 更新后需重新导入投影重建网格；已有Blend只点“修复材质”不能修复旧接触面。
- 本轮提供本地候选安装包，公开下载及用户原工程验收另行确认。



## 0.5.6 发布

修复玻璃与海晶灯、竹块、墙、栅栏、门、活板门等方块衔接处的黑面与重叠，保留外露玻璃、贴图镂空和UV。

- 按实际面与贴图不透明区域裁切，保留不同透明材质的交界。
- 补充粘液块、蜂蜜块、水、冰与霜冰的衔接测试，保留内层结构。
- 保留旗帜图案合成、植被薄片正反UV及失败重导保护。

更新后请重启Blender并重新导入投影；“修复材质”不会重建已有网格。支持Windows x64，最低声明Blender4.2，本轮实际验证环境为Blender5.1.2/Cycles。

安装附件 `Mine2Blend.zip` 与网站 `Mine2Blend-0.5.6.zip` 完全相同，均为已验证安装包原字节：

- 大小：39,186,761字节
- SHA256：`e9bc1dbe81e7f516bc1d4626ac4e665855935e2e291c967281da18f04ff405a2`

