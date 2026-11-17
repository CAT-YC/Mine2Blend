# -*- coding: utf-8 -*-
"""测试真实材质分类，保护复合方块及旧材质命名兼容。"""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('material_utils', Path(__file__).resolve().parents[1] / 'core/material_utils.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MaterialSemantics(unittest.TestCase):
    def test_opaque_ice_does_not_inherit_ice_transparency(self):
        for name in ['packed_ice', 'blue_ice', 'packed_ice.001', 'blue_ice_c_ffffff.001']:
            self.assertEqual(module.material_category_from_name(name), 'opaque', name)

    def test_cauldron_metal_and_water_are_separate(self):
        for name in ['water_cauldron__opaque', 'water_cauldron__opaque_c_ffffff.001', 'water_cauldron_c_ffffff']:
            self.assertEqual(module.material_category_from_name(name), 'opaque', name)
        for name in ['water_cauldron__water', 'water_cauldron__water_c_3f76e4.001', 'water_cauldron_c_3f76e4']:
            self.assertEqual(module.material_category_from_name(name), 'translucent', name)

    def test_existing_material_categories_stay_supported(self):
        for name in ['water', 'glass', 'black_stained_glass', 'glass_pane', 'ice', 'honey_block', 'slime_block']:
            self.assertEqual(module.material_category_from_name(name), 'translucent', name)
        for name in ['oak_leaves', 'bamboo', 'sunflower', 'iron_bars']:
            self.assertEqual(module.material_category_from_name(name), 'cutout', name)
        self.assertEqual(module.material_category_from_name('stone'), 'opaque')

    def test_cauldron_white_metal_does_not_receive_water_tint(self):
        for name in ['water_cauldron__opaque_c_ffffff', 'water_cauldron_c_ffffff']:
            self.assertFalse(module.is_diffuse_tint_name(name), name)

    def test_end_crystal_uses_texture_cutout(self):
        for name in ['entity_end_crystal', 'entity_end_crystal.001']:
            self.assertEqual(module.material_category_from_name(name), 'cutout', name)

if __name__ == '__main__':
    unittest.main()
