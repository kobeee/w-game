#!/usr/bin/env node

/**
 * Node.js版本：自动裁剪PNG图片的透明边缘
 * 备选方案（如果Python不可用）
 *
 * 安装依赖: npm install sharp
 * 运行: node trim_tiles.js
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// 检查sharp库
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('❌ 错误: sharp库未安装');
    console.error('请先安装: npm install sharp');
    process.exit(1);
}

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const copyFile = promisify(fs.copyFile);
const mkdir = promisify(fs.mkdir);

class TileImageProcessor {
    constructor(tilesDir) {
        this.tilesDir = tilesDir;
        this.backupDir = path.join(
            path.dirname(tilesDir),
            'backup',
            new Date().toISOString().slice(0, 19).replace(/:/g, '')
        );
        this.report = {
            timestamp: new Date().toISOString(),
            tiles_dir: tilesDir,
            total_processed: 0,
            total_failed: 0,
            tiles: []
        };
    }

    async backupOriginal(pngPath) {
        try {
            await mkdir(this.backupDir, { recursive: true });
            const backupPath = path.join(this.backupDir, path.basename(pngPath));
            await copyFile(pngPath, backupPath);
            return backupPath;
        } catch (e) {
            console.error(`❌ 备份失败: ${path.basename(pngPath)} - ${e.message}`);
            return null;
        }
    }

    async trimTransparentEdges(pngPath) {
        try {
            const image = sharp(pngPath);
            const metadata = await image.metadata();
            const originalSize = {
                width: metadata.width,
                height: metadata.height
            };

            // 获取原始文件大小
            const originalBytes = (await promisify(fs.stat)(pngPath)).size;

            // 裁剪透明边缘
            const { data: trimmedData, info: trimmedInfo } = await image
                .trim()
                .toBuffer({ resolveWithObject: true });

            const trimmedSize = {
                width: trimmedInfo.width,
                height: trimmedInfo.height
            };

            // 保存裁剪后的图片
            await fs.promises.writeFile(pngPath, trimmedData);
            const trimmedBytes = trimmedData.length;

            // 计算裁剪的像素
            const croppedPixels = {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0
            };

            // 计算透明比例
            const totalPixels = originalSize.width * originalSize.height;
            const contentPixels = trimmedSize.width * trimmedSize.height;
            const transparencyRatio = 1.0 - (contentPixels / totalPixels);

            return {
                success: true,
                original_size: originalSize,
                trimmed_size: trimmedSize,
                cropped_pixels: croppedPixels,
                transparency_ratio: `${(transparencyRatio * 100).toFixed(1)}%`,
                file_size: [originalBytes / 1024, trimmedBytes / 1024],
                error: null
            };
        } catch (e) {
            return {
                success: false,
                original_size: null,
                trimmed_size: null,
                cropped_pixels: null,
                transparency_ratio: null,
                file_size: null,
                error: e.message
            };
        }
    }

    async processAllTiles() {
        if (!fs.existsSync(this.tilesDir)) {
            console.error(`❌ 目录不存在: ${this.tilesDir}`);
            return false;
        }

        const files = await readdir(this.tilesDir);
        const pngFiles = files
            .filter(f => f.startsWith('tile_') && f.endsWith('.png'))
            .sort();

        if (pngFiles.length === 0) {
            console.warn(`⚠️  未找到PNG文件在: ${this.tilesDir}`);
            return false;
        }

        console.log(`\n🔍 找到 ${pngFiles.length} 个PNG文件，开始处理...\n`);

        let maxWidth = 0;
        let maxHeight = 0;

        for (const file of pngFiles) {
            const pngPath = path.join(this.tilesDir, file);
            console.log(`处理: ${file}`);

            // 备份原始文件
            const backupPath = await this.backupOriginal(pngPath);
            if (backupPath) {
                console.log(`  ✓ 已备份到: ${backupPath}`);
            }

            // 裁剪透明边缘
            const result = await this.trimTransparentEdges(pngPath);

            if (result.success) {
                console.log(`  ✓ 裁剪成功`);
                console.log(`    原始尺寸: ${result.original_size.width}×${result.original_size.height}px`);
                console.log(`    裁剪后:   ${result.trimmed_size.width}×${result.trimmed_size.height}px`);
                console.log(`    透明比例: ${result.transparency_ratio}`);
                console.log(`    文件大小: ${result.file_size[0].toFixed(1)}KB → ${result.file_size[1].toFixed(1)}KB`);

                maxWidth = Math.max(maxWidth, result.trimmed_size.width);
                maxHeight = Math.max(maxHeight, result.trimmed_size.height);

                this.report.total_processed++;
            } else {
                console.log(`  ❌ 裁剪失败: ${result.error}`);
                this.report.total_failed++;
            }

            this.report.tiles.push({
                file: file,
                result: result
            });
            console.log();
        }

        this.report.max_trimmed_size = {
            width: maxWidth,
            height: maxHeight,
            note: '所有卡片裁剪后的最大尺寸'
        };

        this.report.summary = {
            total: pngFiles.length,
            success: this.report.total_processed,
            failed: this.report.total_failed
        };

        return this.report.total_failed === 0;
    }

    async saveReport(reportPath = null) {
        if (!reportPath) {
            reportPath = path.join(path.dirname(this.tilesDir), 'trim_report.json');
        }

        await fs.promises.writeFile(reportPath, JSON.stringify(this.report, null, 2), 'utf-8');
        console.log(`📋 处理报告已保存: ${reportPath}`);
        return reportPath;
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 处理摘要');
        console.log('='.repeat(60));
        console.log(`总数:     ${this.report.summary.total} 个文件`);
        console.log(`成功:     ${this.report.summary.success} ✓`);
        console.log(`失败:     ${this.report.summary.failed} ✗`);

        if (this.report.total_processed > 0) {
            console.log(`\n最大裁剪后尺寸: ${this.report.max_trimmed_size.width}×${this.report.max_trimmed_size.height}px`);
            console.log(`备份目录:       ${this.backupDir}`);
        }

        console.log('='.repeat(60) + '\n');
    }
}

async function main() {
    const tilesDir = path.join(
        __dirname,
        '../../src/cocos/assets/bundle/tiles'
    );

    console.log(`
╔════════════════════════════════════════════════════════════╗
║        Cocos Creator 卡片PNG透明边缘裁剪工具 (Node.js)     ║
║                  Tile Image Trimmer v1.0                   ║
╚════════════════════════════════════════════════════════════╝
    `);

    const processor = new TileImageProcessor(tilesDir);

    try {
        const success = await processor.processAllTiles();
        await processor.saveReport();
        processor.printSummary();

        process.exit(success ? 0 : 1);
    } catch (e) {
        console.error('❌ 处理失败:', e.message);
        process.exit(1);
    }
}

main();
