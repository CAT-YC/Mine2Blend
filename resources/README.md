# Mine2Blend 资源目录

本目录存放 Mine2Blend 的内置资源。

## 当前结构

```text
resources/
  converter/
    win-x64/
      node.exe
      mcblock-litematic-converter.cmd
      src/batch-obj-export.mjs
      assets/mcmeta/
      node_modules/
  icons/
```

## 资源版本

当前 `mcmeta` 资源版本由转换器写入 `metadata.json`：

```text
resourceVersion = mcmeta-2026-02-26-copy
converterVersion = spike-0.1.1
```

M2 内测不做自动联网更新资源。后续如只更新 `mcmeta`，应发布资源修复包，并在诊断面板提示当前资源版本。
