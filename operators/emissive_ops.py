import bpy
from ..core import emissive_utils


class MINE2BLEND_OT_update_emissives(bpy.types.Operator):
    bl_idname = 'mine2blend.update_emissives'
    bl_label = '更新方块自发光'
    bl_description = '更新最近投影的常用方块自发光，不改变网格、Alpha或灯笼辅助光'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        settings = context.scene.mine2blend
        collection = bpy.data.collections.get(settings.last_collection_name)
        if collection is None:
            self.report({'WARNING'}, '请先导入投影')
            return {'CANCELLED'}
        try:
            result = emissive_utils.configure_collection(collection, settings.emissive_enabled, settings.emissive_multiplier)
        except (ValueError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        if result['legacy']:
            self.report({'WARNING'}, '请重新导入投影以生成自发光数据')
            return {'CANCELLED'}
        message = '已更新 %d 个常用方块自发光材质' % result['materials']
        settings.last_message = message
        self.report({'INFO'}, message)
        return {'FINISHED'}


def register():
    bpy.utils.register_class(MINE2BLEND_OT_update_emissives)


def unregister():
    try:
        bpy.utils.unregister_class(MINE2BLEND_OT_update_emissives)
    except RuntimeError:
        pass
