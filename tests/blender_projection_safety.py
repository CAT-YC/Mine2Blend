# -*- coding: utf-8 -*-
"""以独立 Blender --background --factory-startup 进程验证实际 ZIP 操作器。

--python 本文件 -- --package ZIP --litematic 文件 --schem 文件 --work-dir 新目录
工作目录必须尚不存在；测试不保存用户偏好，不覆盖已有插件安装。
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

import addon_utils
import bpy


def main():
    parser = argparse.ArgumentParser()
    for option in ('package', 'litematic', 'schem', 'work-dir'):
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    work = Path(args.work_dir).resolve()
    work.mkdir(parents=True, exist_ok=False)
    unpack = work / 'unpacked'
    with zipfile.ZipFile(args.package) as archive:
        assert archive.testzip() is None, 'ZIP CRC 校验失败'
        assert all(name.startswith('mcblock_mine2blend/') and '..' not in Path(name).parts for name in archive.namelist())
        archive.extractall(unpack)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(unpack))
    addon_utils.enable('mcblock_mine2blend', default_set=True, persistent=False)
    from mcblock_mine2blend.core import blender_importer, converter_bridge

    sentinel = bpy.data.objects.new('SafetySentinel', None)
    bpy.context.scene.collection.objects.link(sentinel)
    prefs = bpy.context.preferences.addons['mcblock_mine2blend'].preferences
    prefs.cache_root_path = str(work / 'cache')
    settings = bpy.context.scene.mine2blend
    settings.clear_before_import = True
    settings.split_collections = True
    settings.projection_path = str(Path(args.litematic).resolve())
    assert bpy.ops.mine2blend.import_litematic() == {'FINISHED'}
    assert not settings.last_error
    original = bpy.data.collections[settings.last_collection_name]
    original_pointer = original.as_pointer()
    old_objects = set(blender_importer._objects_recursive(original))
    litematic_blocks = settings.last_block_count
    assert old_objects and litematic_blocks > 0
    old_banner_images = [image for image in bpy.data.images if bpy.path.basename(image.filepath).startswith('banner-')]
    assert all(image.packed_file for image in old_banner_images), '旗帜图像必须内嵌，不能依赖可重置缓存'
    real_converter = converter_bridge.run_litematic_converter

    def damaged(*positional, **keywords):
        result = real_converter(*positional, **keywords)
        Path(result.obj_path).with_suffix('.surfaces.json').write_text('{"version":999,"surfaces":[]}', encoding='utf-8')
        return result

    converter_bridge.run_litematic_converter = damaged
    try:
        try:
            bpy.ops.mine2blend.import_litematic()
        except RuntimeError:
            pass
    finally:
        converter_bridge.run_litematic_converter = real_converter
    assert settings.last_error, '损坏清单必须使操作器明确失败'
    assert old_objects.issubset(set(bpy.data.objects)), '失败重导删除了原模型'
    assert bpy.data.collections.get(original.name) == original, '失败重导丢失原集合'
    assert all(image.packed_file and len(image.pixels) > 0 for image in old_banner_images), '失败重导损坏了旧旗帜图案'
    assert not any('_importing' in c.name for c in blender_importer.list_projection_collections()), '失败重导遗留临时集合'
    assert bpy.ops.mine2blend.import_litematic() == {'FINISHED'}
    assert bpy.data.collections[settings.last_collection_name].as_pointer() == original_pointer, '成功替换应保留原集合 ID'
    assert old_objects.isdisjoint(set(bpy.data.objects)), '成功替换未清除旧对象'
    assert not any('_importing' in c.name for c in bpy.data.collections), '成功替换遗留临时分区'
    original_objects = set(blender_importer._objects_recursive(original))
    settings.projection_path = str(Path(args.schem).resolve())
    assert bpy.ops.mine2blend.import_litematic() == {'FINISHED'}
    schem_blocks = settings.last_block_count
    assert schem_blocks > 0
    assert original_objects.issubset(set(bpy.data.objects)), '导入另一投影影响了既有模型'
    assert bpy.ops.mine2blend.clear_imports() == {'FINISHED'}, '分区模型清理失败'
    assert not blender_importer.list_projection_collections()
    assert sentinel in set(bpy.data.objects), '清理误删非插件对象'
    report = {'status': 'PASS', 'blender': bpy.app.version_string, 'litematicBlocks': litematic_blocks, 'schemBlocks': schem_blocks,
              'failedReplacementPreserved': True, 'collectionIDPreserved': True, 'otherProjectionPreserved': True, 'packedBannerImages': len(old_banner_images), 'clear': 'PASS'}
    (work / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    addon_utils.disable('mcblock_mine2blend', default_set=True)
    print('ZIP_OPERATOR_PASS', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
