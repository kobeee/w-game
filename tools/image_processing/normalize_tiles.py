#!/usr/bin/env python3
"""
二次处理脚本：进一步裁剪 tile_selectable 和 tile_wrong
使得所有卡片统一为 449×449
"""

import os
from PIL import Image
from pathlib import Path

tiles_dir = Path(__file__).parent.parent.parent / "src/cocos/assets/bundle/tiles"

# 处理 tile_selectable.png 和 tile_wrong.png
for filename in ["tile_selectable.png", "tile_wrong.png"]:
    filepath = tiles_dir / filename

    img = Image.open(filepath).convert("RGBA")
    print(f"处理 {filename}: {img.size}")

    # 使用 getbbox() 获取非透明区域
    bbox = img.getbbox()
    if bbox:
        print(f"  原始边界框: {bbox}")
        cropped = img.crop(bbox)
        print(f"  裁剪后: {cropped.size}")

        # 保存
        cropped.save(filepath, "PNG", optimize=True)
        print(f"  ✓ 已保存")
    print()
