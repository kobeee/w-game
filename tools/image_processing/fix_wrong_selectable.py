#!/usr/bin/env python3
"""强制裁剪 tile_wrong 和 tile_selectable 到 449×449，中间对齐"""

from PIL import Image
from pathlib import Path

tiles_dir = Path(__file__).parent.parent.parent / "src/cocos/assets/bundle/tiles"

TARGET_SIZE = 449

for filename in ["tile_wrong.png", "tile_selectable.png"]:
    filepath = tiles_dir / filename

    img = Image.open(filepath).convert("RGBA")
    width, height = img.size

    print(f"处理 {filename}: {width}×{height}")

    # 计算中间裁剪位置
    left = (width - TARGET_SIZE) // 2
    top = (height - TARGET_SIZE) // 2
    right = left + TARGET_SIZE
    bottom = top + TARGET_SIZE

    print(f"  裁剪区域: left={left}, top={top}, right={right}, bottom={bottom}")

    cropped = img.crop((left, top, right, bottom))
    print(f"  结果: {cropped.size}")

    cropped.save(filepath, "PNG", optimize=True)
    print(f"  ✓ 已保存\n")
