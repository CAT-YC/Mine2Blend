import bpy


class Mine2BlendSceneProperties(bpy.types.PropertyGroup):
    projection_path: bpy.props.StringProperty(
        name="投影文件",
        description="选择一个 .litematic 文件",
        default="",
        subtype="FILE_PATH",
    )

    # ── 导入范围（方案 A：一次解析，按区分子集合）──
    include_blocks: bpy.props.BoolProperty(
        name="方块",
        description="普通方块。取消勾选可以只导入家具和摆件",
        default=True,
    )

    include_block_entities: bpy.props.BoolProperty(
        name="方块实体",
        description="箱子 / 床 / 告示牌 / 旗帜 / 头颅 / 潜影盒 等带 BlockEntity 的方块",
        default=True,
    )

    include_entities: bpy.props.BoolProperty(
        name="投影自带实体",
        description="投影文件 Entities 列表里的画 / 物品展示框 / 盔甲架 / 生物",
        default=True,
    )

    split_collections: bpy.props.BoolProperty(
        name="分子集合放置",
        description="导入后分成 方块 / 方块实体 / 实体 三个子集合，便于单独调材质和渲染",
        default=True,
    )

    entity_placeholder_empties: bpy.props.BoolProperty(
        name="无模型实体建空物体占位",
        description="内置模型库覆盖 102 类实体；少数没覆盖到的（掉落物、末影水晶等）"
                    "按原坐标建一个空物体标记位置，方便自己放模型。空物体不参与渲染",
        default=True,
    )

    # 数量预览（选完文件由 --probe-only 扫出来，不用等完整导入）
    probe_blocks: bpy.props.IntProperty(name="方块", default=-1)
    probe_block_entities: bpy.props.IntProperty(name="方块实体", default=-1)
    probe_entities: bpy.props.IntProperty(name="自带实体", default=-1)
    probe_entities_modelled: bpy.props.IntProperty(name="有模型实体", default=-1)
    probe_entities_placeholder: bpy.props.IntProperty(name="占位实体", default=-1)
    probe_source_path: bpy.props.StringProperty(name="预览对应文件", default="")

    scale_factor: bpy.props.FloatProperty(
        name="导入比例",
        description="导入后整体缩放比例",
        default=1.0,
        min=0.001,
        max=100.0,
        precision=3,
    )

    center_model: bpy.props.BoolProperty(
        name="导入后居中",
        description="把模型在水平面居中到世界原点附近",
        default=True,
    )

    place_on_ground: bpy.props.BoolProperty(
        name="贴到地面",
        description="导入后把模型最低点移动到 Z=0",
        default=True,
    )

    clear_before_import: bpy.props.BoolProperty(
        name="重新导入同名文件时替换",
        description="重新导入同一个 .litematic 时，先清空它上次的导入集合；不会影响其它已导入的建筑",
        default=True,
    )

    auto_arrange: bpy.props.BoolProperty(
        name="多个建筑自动并排",
        description="导入多个不同建筑时，自动把新建筑排到已导入建筑的一侧，避免都堆在原点重叠",
        default=True,
    )

    collection_prefix: bpy.props.StringProperty(
        name="集合前缀",
        description="导入集合会命名为 前缀_文件名",
        default="Mine2Blend",
    )

    fix_selected_only: bpy.props.BoolProperty(
        name="只修复选中对象",
        description="开启后材质修复只处理当前选中的对象",
        default=False,
    )

    last_message: bpy.props.StringProperty(name="最近结果", default="")
    last_error: bpy.props.StringProperty(name="最近错误", default="")
    last_error_category: bpy.props.StringProperty(name="错误类型", default="")
    last_progress_step: bpy.props.StringProperty(name="当前步骤", default="")
    last_source_name: bpy.props.StringProperty(name="来源文件", default="")
    last_output_dir: bpy.props.StringProperty(name="输出目录", default="")
    last_collection_name: bpy.props.StringProperty(name="导入集合", default="")
    last_conversion_seconds: bpy.props.FloatProperty(name="转换耗时", default=0.0, min=0.0, precision=2)
    last_import_seconds: bpy.props.FloatProperty(name="导入耗时", default=0.0, min=0.0, precision=2)
    last_total_seconds: bpy.props.FloatProperty(name="总耗时", default=0.0, min=0.0, precision=2)
    last_cleared_object_count: bpy.props.IntProperty(name="清理旧对象", default=0, min=0)
    last_imported_object_count: bpy.props.IntProperty(name="导入对象", default=0, min=0)
    last_performance_warning: bpy.props.StringProperty(name="性能提示", default="")
    last_block_count: bpy.props.IntProperty(name="方块数", default=0, min=0)
    last_width: bpy.props.IntProperty(name="宽", default=0, min=0)
    last_height: bpy.props.IntProperty(name="高", default=0, min=0)
    last_depth: bpy.props.IntProperty(name="深", default=0, min=0)
    last_material_count: bpy.props.IntProperty(name="材质数", default=0, min=0)
    last_material_fix_closest: bpy.props.IntProperty(name="Closest 修复", default=0, min=0)
    last_material_fix_tint: bpy.props.IntProperty(name="补色修复", default=0, min=0)
    last_material_fix_alpha: bpy.props.IntProperty(name="Alpha 连接", default=0, min=0)
    last_material_fix_alpha_mode: bpy.props.IntProperty(name="透明模式", default=0, min=0)
    last_material_issue_count: bpy.props.IntProperty(name="材质风险数", default=0, min=0)
    last_material_audit: bpy.props.StringProperty(name="材质审计", default="")
    last_face_count: bpy.props.IntProperty(name="面数", default=0, min=0)
    last_entity_summary: bpy.props.StringProperty(name="实体导入结果", default="")
    last_entity_placeholder_count: bpy.props.IntProperty(name="占位空物体", default=0, min=0)
    last_unknown_painting_variants: bpy.props.StringProperty(name="未知画尺寸", default="")
    last_converter_version: bpy.props.StringProperty(name="转换器版本", default="")
    last_resource_version: bpy.props.StringProperty(name="资源版本", default="")
    last_log_excerpt: bpy.props.StringProperty(name="最近日志", default="")


_CLASSES = (Mine2BlendSceneProperties,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.mine2blend = bpy.props.PointerProperty(type=Mine2BlendSceneProperties)


def unregister():
    if hasattr(bpy.types.Scene, "mine2blend"):
        del bpy.types.Scene.mine2blend
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
