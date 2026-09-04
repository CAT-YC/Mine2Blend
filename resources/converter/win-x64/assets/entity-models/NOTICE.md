# 第三方数据来源 / Third-party data attribution

本目录下的 `*.json` 实体模型几何数据 vendored 自：

- **来源**：[SizableShrimp/EntityModelJson](https://github.com/SizableShrimp/EntityModelJson) · `vanilla_layers/main/`
- **分支**：`1.19.x`
- **本次核对提交**：`39fec50d012e88e006fe084416fb8b80a0f100e3`
- **License**：MIT
- **Copyright**：(c) 2022 SizableShrimp

仅复用 vanilla Minecraft Java 版实体模型几何（box-UV 坐标 / 骨骼层级），用于 MCBlock 网站在线编辑器（Studio）渲染投影内的生物实体。贴图沿用站点已有的 mcmeta atlas（Java 版实体贴图，UV 与本几何数据对齐）。

> 格式备注：`grow` = cube 膨胀(inflate)；`mirror` = cube UV 水平翻转；`material.xTexSize/yTexSize` = 皮肤逻辑尺寸；`partPose{x,y,z,xRot,yRot,zRot}` = 骨骼平移(像素)+旋转(弧度)；MC 实体模型为 Y 轴向下，加载时需翻转对齐站点坐标系。

批 E1 新增 `armor_stand.json`、`minecart.json` 与 `lead_knot.json`；其中上游文件名为 `leash_knot.json`，站内按任务命名保存为 `lead_knot.json`。

批 E4 新增 `boat.json` 与 `chest_boat.json`，分别取自上游 `vanilla_layers/main/boat/oak.json` 与 `vanilla_layers/main/chest_boat/oak.json`。上游同目录 7 个木种的模型文件逐字节一致，站内仅保留一份几何并按实体木种动态选择 atlas 贴图。竹筏几何不在该分支数据源内，因此不复用船体模型。

批 M1 新增 `zombie.json`、`zombie_villager.json`、`iron_golem.json` 与 `cat.json`。前三者对应上游同名文件；上游 `cat.json` 标记 `mesh.overwrite=false`，属于需要与基础层合并的增量数据，不能被当前单文件加载器直接使用，因此站内 `cat.json` 取自同目录完整的 `ocelot.json` 猫科基础几何，并搭配现有 tabby 猫贴图。僵尸村民职业/等级/群系叠层与猫花色变体已在批 M2 接入。

批 M3 新增 `pig.json`、`pig_saddle.json`、`sheep.json`、`sheep_fur.json`、`chicken.json`、`wolf.json`、`horse.json`、`rabbit.json` 与 `fox.json`。除 `pig_saddle.json` 取自上游 `vanilla_layers/saddle/pig.json`、`sheep_fur.json` 取自 `vanilla_layers/fur/sheep.json` 外，其余均取自 `vanilla_layers/main/` 同名文件。羊毛、猪鞍与狼项圈使用独立叠加网格；马模型运行时剔除上游同文件内仅供幼体状态切换的四条 `*_baby_leg`，避免成人腿和幼体腿同时显示。

批 M4 新增 72 份模型 JSON，覆盖其余 60 类可由 1.19.x 数据源与站内 atlas 直接配对的生物。63 份基础/多阶段模型取自 `vanilla_layers/main/`：包含熊猫、美西螈、羊驼、蜜蜂、鹦鹉、全部鱼类与鱿鱼，也包含 1.19.x 的其余被动、中立、敌对及水生生物；另 9 份叠加模型分别取自 `decor/llama.json`、`pattern/tropical_fish_{small,large}.json`、`outer/{drowned,slime,stray}.json`、`saddle/strider.json` 与 `armor/{creeper,wither}.json`，站内按用途加后缀保存。驴、骡、骷髅马、僵尸马运行时与成人马一样剔除同文件内的 `*_baby_leg`；vendor 原始 JSON 不改。蝙蝠、恶魂、岩浆怪、恼鬼的 1.19.x 模型 UV 与站内较新 atlas 纹理布局不兼容，不登记为精确模型；骆驼、嗅探兽、犰狳属于 1.20+，不在固定的 1.19.x 数据源内；以上实体继续走占位回退。

批 E5 新增 `armor_stand_outer_armor.json` 与 `armor_stand_inner_armor.json`，分别取自上游 `vanilla_layers/outer_armor/armor_stand.json` 与 `vanilla_layers/inner_armor/armor_stand.json`。站内运行时按原版槽位可见性裁出头盔、胸甲、护腿和靴子网格，装备纹理继续使用现有 mcmeta atlas；皮革甲使用默认皮革染色并叠加 `leather_overlay`。
