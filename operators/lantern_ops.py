import bpy
from ..core import lantern_utils


class MINE2BLEND_OT_update_lanterns(bpy.types.Operator):
    bl_idname = 'mine2blend.update_lanterns'
    bl_label = '更新灯笼效果'
    bl_description = '更新最近导入投影的灯笼自发光和辅助点光，不修改网格或其他投影'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        settings = context.scene.mine2blend
        collection = bpy.data.collections.get(settings.last_collection_name)
        if collection is None or not collection.get('m2b_lantern_manifest'):
            self.report({'WARNING'}, '请先重新导入投影以生成灯笼数据')
            return {'CANCELLED'}
        try:
            result = lantern_utils.configure_collection(collection, settings.lantern_emission,
                settings.lantern_strength, settings.lantern_auxiliary, settings.lantern_power, settings.lantern_limit)
        except (ValueError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        message = '灯笼 %d 盏，辅助点光 %d 个' % (result['lanterns'], result['lights'])
        if result['skipped']:
            message += '；另 %d 盏达到数量上限，仍保留自发光' % result['skipped']
        settings.last_message = message
        self.report({'WARNING'} if result['skipped'] else {'INFO'}, message)
        return {'FINISHED'}


def register():
    bpy.utils.register_class(MINE2BLEND_OT_update_lanterns)


def unregister():
    try:
        bpy.utils.unregister_class(MINE2BLEND_OT_update_lanterns)
    except RuntimeError:
        pass
