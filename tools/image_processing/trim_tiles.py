#!/usr/bin/env python3
"""
自动裁剪PNG图片的透明边缘
用于去除Cocos Creator卡片图片的透明填充区域
"""

import os
import sys
from pathlib import Path
from PIL import Image
import json
from datetime import datetime


class TileImageProcessor:
    def __init__(self, tiles_dir):
        """初始化处理器"""
        self.tiles_dir = Path(tiles_dir)
        self.backup_dir = self.tiles_dir.parent / "backup" / datetime.now().strftime("%Y%m%d_%H%M%S")
        self.report = {
            "timestamp": datetime.now().isoformat(),
            "tiles_dir": str(self.tiles_dir),
            "total_processed": 0,
            "total_failed": 0,
            "tiles": []
        }

    def backup_original(self, png_path):
        """备份原始PNG文件"""
        try:
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            backup_path = self.backup_dir / png_path.name

            # 读取原始文件
            with open(png_path, 'rb') as src:
                with open(backup_path, 'wb') as dst:
                    dst.write(src.read())

            return str(backup_path)
        except Exception as e:
            print(f"❌ 备份失败: {png_path.name} - {e}")
            return None

    def trim_transparent_edges(self, png_path):
        """
        裁剪PNG图片的透明边缘

        返回: {
            'success': bool,
            'original_size': (width, height),
            'trimmed_size': (width, height),
            'cropped_pixels': {top, bottom, left, right},
            'transparency_ratio': float (0-1),
            'file_size': (original_kb, trimmed_kb),
            'error': str or None
        }
        """
        try:
            # 打开图片
            img = Image.open(png_path).convert("RGBA")
            original_size = img.size
            original_bytes = os.path.getsize(png_path)

            # 获取非透明区域的边界框
            bbox = img.getbbox()

            if bbox is None:
                # 全透明图片
                return {
                    'success': False,
                    'original_size': original_size,
                    'trimmed_size': None,
                    'cropped_pixels': None,
                    'transparency_ratio': 1.0,
                    'file_size': (original_bytes / 1024, 0),
                    'error': '图片全透明，无法处理'
                }

            # 计算裁剪信息
            left, top, right, bottom = bbox
            trimmed_size = (right - left, bottom - top)
            cropped_pixels = {
                'left': left,
                'top': top,
                'right': original_size[0] - right,
                'bottom': original_size[1] - bottom
            }

            # 计算透明比例
            total_pixels = original_size[0] * original_size[1]
            content_pixels = trimmed_size[0] * trimmed_size[1]
            transparency_ratio = 1.0 - (content_pixels / total_pixels)

            # 裁剪图片
            cropped_img = img.crop(bbox)

            # 保存回原位置
            cropped_img.save(png_path, "PNG", optimize=True)
            trimmed_bytes = os.path.getsize(png_path)

            return {
                'success': True,
                'original_size': original_size,
                'trimmed_size': trimmed_size,
                'cropped_pixels': cropped_pixels,
                'transparency_ratio': f"{transparency_ratio * 100:.1f}%",
                'file_size': (original_bytes / 1024, trimmed_bytes / 1024),
                'error': None
            }

        except Exception as e:
            return {
                'success': False,
                'original_size': None,
                'trimmed_size': None,
                'cropped_pixels': None,
                'transparency_ratio': None,
                'file_size': None,
                'error': str(e)
            }

    def process_all_tiles(self):
        """处理所有PNG文件"""
        if not self.tiles_dir.exists():
            print(f"❌ 目录不存在: {self.tiles_dir}")
            return False

        # 找到所有PNG文件
        png_files = list(self.tiles_dir.glob("tile_*.png"))

        if not png_files:
            print(f"⚠️  未找到PNG文件在: {self.tiles_dir}")
            return False

        print(f"\n🔍 找到 {len(png_files)} 个PNG文件，开始处理...\n")

        max_width = 0
        max_height = 0

        for png_path in sorted(png_files):
            print(f"处理: {png_path.name}")

            # 备份原始文件
            backup_path = self.backup_original(png_path)
            if backup_path:
                print(f"  ✓ 已备份到: {backup_path}")

            # 裁剪透明边缘
            result = self.trim_transparent_edges(png_path)

            if result['success']:
                print(f"  ✓ 裁剪成功")
                print(f"    原始尺寸: {result['original_size'][0]}×{result['original_size'][1]}px")
                print(f"    裁剪后:   {result['trimmed_size'][0]}×{result['trimmed_size'][1]}px")
                print(f"    透明比例: {result['transparency_ratio']}")
                print(f"    文件大小: {result['file_size'][0]:.1f}KB → {result['file_size'][1]:.1f}KB")

                # 记录最大尺寸（用于统一调整）
                max_width = max(max_width, result['trimmed_size'][0])
                max_height = max(max_height, result['trimmed_size'][1])

                self.report['total_processed'] += 1
            else:
                print(f"  ❌ 裁剪失败: {result['error']}")
                self.report['total_failed'] += 1

            self.report['tiles'].append({
                'file': png_path.name,
                'result': result
            })
            print()

        # 生成处理报告
        self.report['max_trimmed_size'] = {
            'width': max_width,
            'height': max_height,
            'note': '所有卡片裁剪后的最大尺寸'
        }
        self.report['summary'] = {
            'total': len(png_files),
            'success': self.report['total_processed'],
            'failed': self.report['total_failed']
        }

        return self.report['total_failed'] == 0

    def save_report(self, report_path=None):
        """保存处理报告"""
        if report_path is None:
            report_path = self.tiles_dir.parent / "trim_report.json"

        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(self.report, f, ensure_ascii=False, indent=2)

        print(f"📋 处理报告已保存: {report_path}")
        return report_path

    def print_summary(self):
        """打印处理摘要"""
        print("\n" + "="*60)
        print("📊 处理摘要")
        print("="*60)
        print(f"总数:     {self.report['summary']['total']} 个文件")
        print(f"成功:     {self.report['summary']['success']} ✓")
        print(f"失败:     {self.report['summary']['failed']} ✗")

        if self.report['total_processed'] > 0:
            print(f"\n最大裁剪后尺寸: {self.report['max_trimmed_size']['width']}×{self.report['max_trimmed_size']['height']}px")
            print(f"备份目录:       {self.backup_dir}")

        print("="*60 + "\n")


def main():
    """主函数"""
    # 默认处理路径
    tiles_dir = Path(__file__).parent.parent.parent / "src/cocos/assets/bundle/tiles"

    # 如果命令行指定了路径，使用命令行参数
    if len(sys.argv) > 1:
        tiles_dir = Path(sys.argv[1])

    print(f"""
╔════════════════════════════════════════════════════════════╗
║           Cocos Creator 卡片PNG透明边缘裁剪工具            ║
║                  Tile Image Trimmer v1.0                   ║
╚════════════════════════════════════════════════════════════╝
    """)

    processor = TileImageProcessor(tiles_dir)

    # 处理所有PNG
    success = processor.process_all_tiles()

    # 保存报告
    processor.save_report()

    # 打印摘要
    processor.print_summary()

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
