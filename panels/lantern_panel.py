import bpy
from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_lantern(bpy.types.Panel):
    bl_label = '灯笼光照'
    bl_idname = 'MINE2BLEND_PT_lantern'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = PANEL_CATEGORY
    bl_parent_id = 'MINE2BLEND_PT_root'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend
        layout.label(text='普通 / 灵魂 / 铜系灯笼（含悬挂）')
        layout.prop(settings, 'lantern_emission')
        row = layout.row(); row.enabled = settings.lantern_emission
        row.prop(settings, 'lantern_strength')
        layout.prop(settings, 'lantern_auxiliary')
        col = layout.column(); col.enabled = settings.lantern_auxiliary
        col.prop(settings, 'lantern_power'); col.prop(settings, 'lantern_limit')
        col.label(text='每盏 4 个点光，保留阴影')
        layout.label(text='作用于最近导入的投影')
        layout.operator('mine2blend.update_lanterns', icon='LIGHT_POINT')


def register():
    bpy.utils.register_class(MINE2BLEND_PT_lantern)


def unregister():
    try:
        bpy.utils.unregister_class(MINE2BLEND_PT_lantern)
    except RuntimeError:
        pass
