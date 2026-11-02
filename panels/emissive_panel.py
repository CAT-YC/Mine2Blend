import bpy
from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_emissive(bpy.types.Panel):
    bl_label = '方块自发光'
    bl_idname = 'MINE2BLEND_PT_emissive'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = PANEL_CATEGORY
    bl_parent_id = 'MINE2BLEND_PT_root'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend
        layout.prop(settings, 'emissive_enabled')
        row = layout.row();row.enabled = settings.emissive_enabled
        row.prop(settings, 'emissive_multiplier')
        layout.label(text='浆果 / 火把 / 蜡烛 / 炉具 / 铜灯等')
        layout.label(text='按点燃、含水、浆果和充能状态生效')
        layout.label(text='灯笼在“灯笼光照”中独立控制')
        layout.label(text='作用于最近导入的投影')
        layout.operator('mine2blend.update_emissives', icon='MATERIAL')


def register():
    bpy.utils.register_class(MINE2BLEND_PT_emissive)


def unregister():
    try:
        bpy.utils.unregister_class(MINE2BLEND_PT_emissive)
    except RuntimeError:
        pass
