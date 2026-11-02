# 发光方块范围与来源（0.5.9候选）

Minecraft Wiki光源表于2026-11-02经公开API读取：79行、68种名称。当前58种名称映射为106个随包Java光源ID；同一方块不同状态单独记录。下表保留百科列出的游戏亮度，Cycles使用可调视觉预设，不模拟Minecraft光照传播。

来源：[光源总表](https://minecraft.wiki/w/Light#Light-emitting_blocks)、[发光浆果](https://minecraft.wiki/w/Glow_berries)、[蜡烛](https://minecraft.wiki/w/Candle)、[海泡菜](https://minecraft.wiki/w/Sea_Pickle)、[铜灯](https://minecraft.wiki/w/Copper_Bulb)、[重生锚](https://minecraft.wiki/w/Respawn_Anchor)、[潮涌核心](https://minecraft.wiki/w/Conduit)、[发光地衣](https://minecraft.wiki/w/Glow_Lichen)。

| 百科名称/条件 | 游戏亮度 | Java ID / 范围 | 本版状态 |
| --- | --- | --- | --- |
| Beacon  | 15 | beacon | 已接入灯笼光照或方块自发光 |
| Conduit (active) | 15 | conduit | 已接入灯笼光照或方块自发光 |
| Copper Lantern  | 15 | copper_lantern, waxed_copper_lantern, exposed_copper_lantern, waxed_exposed_copper_lantern, weathered_copper_lantern, waxed_weathered_copper_lantern, oxidized_copper_lantern, waxed_oxidized_copper_lantern | 已接入灯笼光照或方块自发光 |
| End Gateway  | 15 | end_gateway | 专用光源/表面渲染未实现 |
| End Portal  | 15 | end_portal | 专用光源/表面渲染未实现 |
| Fire  | 15 | fire | 已接入灯笼光照或方块自发光 |
| Sea Pickle (four, waterlogged) | 15 | sea_pickle | 已接入灯笼光照或方块自发光 |
| Ochre Froglight  | 15 | ochre_froglight | 已接入灯笼光照或方块自发光 |
| Verdant Froglight  | 15 | verdant_froglight | 已接入灯笼光照或方块自发光 |
| Pearlescent Froglight  | 15 | pearlescent_froglight | 已接入灯笼光照或方块自发光 |
| Glowstone  | 15 | glowstone | 已接入灯笼光照或方块自发光 |
| Jack o'Lantern  | 15 | jack_o_lantern | 已接入灯笼光照或方块自发光 |
| Lantern  | 15 | lantern | 已接入灯笼光照或方块自发光 |
| Lava  | 15 | lava | 已接入灯笼光照或方块自发光 |
| Lava Cauldron  | 15 | lava_cauldron | 已接入灯笼光照或方块自发光 |
| Campfire (lit) | 15 | campfire | 已接入灯笼光照或方块自发光 |
| Redstone Lamp (lit) | 15 | redstone_lamp | 已接入灯笼光照或方块自发光 |
| Respawn Anchor (four charges) | 15 | respawn_anchor | 已接入灯笼光照或方块自发光 |
| Sea Lantern  | 15 | sea_lantern | 已接入灯笼光照或方块自发光 |
| Shroomlight  | 15 | shroomlight | 已接入灯笼光照或方块自发光 |
| Copper Bulb (lit) | 15 | copper_bulb, waxed_copper_bulb | 已接入灯笼光照或方块自发光 |
| Cave Vines (with berries) | 14 | cave_vines, cave_vines_plant | 已接入灯笼光照或方块自发光 |
| Copper Torch  | 14 | copper_torch, copper_wall_torch | 已接入灯笼光照或方块自发光 |
| End Rod  | 14 | end_rod | 已接入灯笼光照或方块自发光 |
| Torch  | 14 | torch, wall_torch | 已接入灯笼光照或方块自发光 |
| Blue Torch  | 14 | blue_torch | 基岩/教育版，不属于Java资源 |
| Purple Torch  | 14 | purple_torch | 基岩/教育版，不属于Java资源 |
| Red Torch  | 14 | red_torch | 基岩/教育版，不属于Java资源 |
| Green Torch  | 14 | green_torch | 基岩/教育版，不属于Java资源 |
| Underwater Torch  | 14 | underwater_torch | 基岩/教育版，不属于Java资源 |
| Furnace (lit) | 13 | furnace | 已接入灯笼光照或方块自发光 |
| Blast Furnace (lit) | 13 | blast_furnace | 已接入灯笼光照或方块自发光 |
| Smoker (lit) | 13 | smoker | 已接入灯笼光照或方块自发光 |
| Vault (active) | 12 | vault | 已接入灯笼光照或方块自发光 |
| Candle (four, lit) | 12 | candle, white_candle, orange_candle, magenta_candle, light_blue_candle, yellow_candle, lime_candle, pink_candle, gray_candle, light_gray_candle, cyan_candle, purple_candle, blue_candle, brown_candle, green_candle, red_candle, black_candle | 已接入灯笼光照或方块自发光 |
| Sea Pickle (three, waterlogged) | 12 | sea_pickle | 已接入灯笼光照或方块自发光 |
| Exposed Copper Bulb (lit) | 12 | exposed_copper_bulb, waxed_exposed_copper_bulb | 已接入灯笼光照或方块自发光 |
| Glowing Obsidian  | 12 | glowing_obsidian | 基岩/教育版，不属于Java资源 |
| Nether Portal  | 11 | nether_portal | 已接入灯笼光照或方块自发光 |
| Respawn Anchor (three charges) | 11 | respawn_anchor | 已接入灯笼光照或方块自发光 |
| Crying Obsidian  | 10 | crying_obsidian | 已接入灯笼光照或方块自发光 |
| Soul Campfire (lit) | 10 | soul_campfire | 已接入灯笼光照或方块自发光 |
| Soul Fire  | 10 | soul_fire | 已接入灯笼光照或方块自发光 |
| Soul Lantern  | 10 | soul_lantern | 已接入灯笼光照或方块自发光 |
| Soul Torch  | 10 | soul_torch, soul_wall_torch | 已接入灯笼光照或方块自发光 |
| Candle (three, lit) | 9 | candle, white_candle, orange_candle, magenta_candle, light_blue_candle, yellow_candle, lime_candle, pink_candle, gray_candle, light_gray_candle, cyan_candle, purple_candle, blue_candle, brown_candle, green_candle, red_candle, black_candle | 已接入灯笼光照或方块自发光 |
| Deepslate Redstone Ore (lit) | 9 | deepslate_redstone_ore | 已接入灯笼光照或方块自发光 |
| Redstone Ore (lit) | 9 | redstone_ore | 已接入灯笼光照或方块自发光 |
| Sea Pickle (two, waterlogged) | 9 | sea_pickle | 已接入灯笼光照或方块自发光 |
| Trial Spawner (active) | 8 | trial_spawner | 已接入灯笼光照或方块自发光 |
| Weathered Copper Bulb (lit) | 8 | weathered_copper_bulb, waxed_weathered_copper_bulb | 已接入灯笼光照或方块自发光 |
| Enchanting Table  | 7 | enchanting_table | 已接入灯笼光照或方块自发光 |
| Ender Chest  | 7 | ender_chest | 已接入灯笼光照或方块自发光 |
| Glow Lichen  | 7 | glow_lichen | 已接入灯笼光照或方块自发光 |
| Redstone Torch (lit) | 7 | redstone_torch, redstone_wall_torch | 已接入灯笼光照或方块自发光 |
| Respawn Anchor (two charges) | 7 | respawn_anchor | 已接入灯笼光照或方块自发光 |
| Candle (two, lit) | 6 | candle, white_candle, orange_candle, magenta_candle, light_blue_candle, yellow_candle, lime_candle, pink_candle, gray_candle, light_gray_candle, cyan_candle, purple_candle, blue_candle, brown_candle, green_candle, red_candle, black_candle | 已接入灯笼光照或方块自发光 |
| Sea Pickle (one, waterlogged) | 6 | sea_pickle | 已接入灯笼光照或方块自发光 |
| Sculk Catalyst  | 6 | sculk_catalyst | 已接入灯笼光照或方块自发光 |
| Vault (inactive) | 6 | vault | 已接入灯笼光照或方块自发光 |
| Amethyst Cluster  | 5 | amethyst_cluster | 已接入灯笼光照或方块自发光 |
| Large Amethyst Bud  | 4 | large_amethyst_bud | 已接入灯笼光照或方块自发光 |
| Oxidized Copper Bulb (lit) | 4 | oxidized_copper_bulb, waxed_oxidized_copper_bulb | 已接入灯笼光照或方块自发光 |
| Trial Spawner (waiting) | 4 | trial_spawner | 已接入灯笼光照或方块自发光 |
| Ice Crystal  | 4 | ice_crystal | 实验内容，随包缺资源 |
| Candle (one, lit) | 3 | candle, white_candle, orange_candle, magenta_candle, light_blue_candle, yellow_candle, lime_candle, pink_candle, gray_candle, light_gray_candle, cyan_candle, purple_candle, blue_candle, brown_candle, green_candle, red_candle, black_candle | 已接入灯笼光照或方块自发光 |
| Candle Cake (lit) | 3 | candle_cake, white_candle_cake, orange_candle_cake, magenta_candle_cake, light_blue_candle_cake, yellow_candle_cake, lime_candle_cake, pink_candle_cake, gray_candle_cake, light_gray_candle_cake, cyan_candle_cake, purple_candle_cake, blue_candle_cake, brown_candle_cake, green_candle_cake, red_candle_cake, black_candle_cake | 已接入灯笼光照或方块自发光 |
| Magma Block  | 3 | magma_block | 已接入灯笼光照或方块自发光 |
| Respawn Anchor (one charge) | 3 | respawn_anchor | 已接入灯笼光照或方块自发光 |
| Medium Amethyst Bud  | 2 | medium_amethyst_bud | 已接入灯笼光照或方块自发光 |
| Firefly Bush (when not snowlogged) | 2 | firefly_bush | 已接入灯笼光照或方块自发光 |
| Brewing Stand  | 1 | brewing_stand | 已接入灯笼光照或方块自发光 |
| Brown Mushroom  | 1 | brown_mushroom | 已接入灯笼光照或方块自发光 |
| Calibrated Sculk Sensor  | 1 | calibrated_sculk_sensor | 已接入灯笼光照或方块自发光 |
| Dragon Egg  | 1 | dragon_egg | 已接入灯笼光照或方块自发光 |
| End Portal Frame  | 1 | end_portal_frame | 已接入灯笼光照或方块自发光 |
| Sculk Sensor  | 1 | sculk_sensor | 已接入灯笼光照或方块自发光 |
| Small Amethyst Bud  | 1 | small_amethyst_bud | 已接入灯笼光照或方块自发光 |
| Light (block)  | 0–15 | light | 专用光源/表面渲染未实现 |

睁眼眼眸花为原生全亮纹理，不产生游戏方块光；旧flowing_lava仅为兼容别名，不计入106个现代ID。

处理细节：有浆果才点亮果实；蜡烛只亮烛芯、数量随实际几何增加而不二次平方放大；海泡菜只在含水时点亮顶部；炉具只亮炉口；红石矿同纹理的亮灭使用角点状态；充能/氧化按等级分开。火焰和粒子动画保持静态贴图首帧，未新增粒子几何。

独立页面核对：潮涌核心激活与否均亮度15；幽匿感测体阶段变化不改变亮度1；发光地衣采用英文独立页亮度7（中文总表当日为6）。雪覆萤火虫灌木的限制只属于基岩版。

本候选仅验证Blender5.1.2 Cycles；Blender4.2/EEVEE/自定义资源包/大规模性能/用户原工程未代验。
