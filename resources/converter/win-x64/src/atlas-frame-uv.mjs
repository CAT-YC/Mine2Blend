// 静态 OBJ 仍选首帧；将边线移到边缘纹素中心，保护基础级 Closest 采样。
// 输入为有效像素矩形 [x, y, width, height]，V=0 在图像顶部；不处理动画或 mip 层级。
export function makeFrameUV([x, y, width, height], atlasWidth, atlasHeight) {
  const frameHeight = Math.min(height, width)
  return [(x + 0.5) / atlasWidth, (y + 0.5) / atlasHeight,
    (x + width - 0.5) / atlasWidth, (y + frameHeight - 0.5) / atlasHeight]
}
