# Mine2Blend 转换器资源

M2 内测先采用 Windows x64 runtime 分发形态，而不是单 exe。

当前已内置：

```text
win-x64/
  node.exe
  mcblock-litematic-converter.cmd
  src/batch-obj-export.mjs
  assets/mcmeta/
  node_modules/
```

插件会优先查找：

```text
resources/converter/win-x64/mcblock-litematic-converter.cmd
resources/converter/win-x64/mcblock-litematic-converter.exe
resources/converter/darwin-arm64/mcblock-litematic-converter
resources/converter/darwin-x64/mcblock-litematic-converter
resources/converter/linux-x64/mcblock-litematic-converter
```

Windows runtime 已在 M1.5 Spike 中通过 3 个 `.litematic` Smoke 样本验证，输出 OBJ / MTL / atlas / metadata；基础 Windows Defender 扫描未发现威胁。

M3.1 起转换器版本为 `spike-0.1.1`，新增 `--preserve-adjacent-faces`。Mine2Blend 默认启用该参数，导入 Blender 时优先保留相邻方块内侧面，避免后续对象拆分或编辑时出现缺面。

正式跨平台分发前还需要补 macOS / Linux runtime，并继续评估单 exe、exe + resources、或用纯 JS 图像库替换 `sharp` 的降体积路线。
