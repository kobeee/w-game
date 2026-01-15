/**
 * build-zip.js
 * 构建后处理脚本：将 remote 目录打包成 ZIP
 * 
 * 使用方法：
 * 1. cd tools && npm install
 * 2. npm run build-zip
 * 
 * 或直接：
 * node tools/build-zip.js
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 配置
const BUILD_PATH = path.join(__dirname, '../src/cocos/build/wechatgame');
const REMOTE_PATH = path.join(BUILD_PATH, 'remote');
const OUTPUT_PATH = path.join(BUILD_PATH, 'remote.zip');

async function buildZip() {
    // 检查 remote 目录是否存在
    if (!fs.existsSync(REMOTE_PATH)) {
        console.error('❌ remote 目录不存在:', REMOTE_PATH);
        console.log('请先在 Cocos Creator 中构建微信小游戏');
        process.exit(1);
    }

    console.log('📦 开始打包 remote 目录...');
    console.log('源目录:', REMOTE_PATH);
    console.log('输出文件:', OUTPUT_PATH);

    // 统计原始文件数量
    let fileCount = 0;
    let totalSize = 0;
    const countFiles = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                countFiles(filePath);
            } else {
                fileCount++;
                totalSize += stat.size;
            }
        });
    };
    countFiles(REMOTE_PATH);
    console.log(`📊 原始统计: ${fileCount} 个文件, 总大小 ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    // 创建输出流
    const output = fs.createWriteStream(OUTPUT_PATH);
    const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
    });

    // 返回 Promise
    return new Promise((resolve, reject) => {
        // 监听事件
        output.on('close', () => {
            const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
            console.log(`✅ ZIP 打包完成: ${sizeInMB} MB`);
            console.log(`文件位置: ${OUTPUT_PATH}`);
            console.log(`📊 统计: ${fileCount} 个文件 → 1 个 ZIP`);
            console.log(`📊 压缩率: ${((1 - archive.pointer() / totalSize) * 100).toFixed(1)}%`);
            console.log('🎉 请将 remote.zip 上传到资源服务器');
            resolve();
        });

        archive.on('error', (err) => {
            console.error('❌ 打包失败:', err);
            reject(err);
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('⚠️ 警告:', err);
            } else {
                throw err;
            }
        });

        // 进度报告
        let lastReported = 0;
        archive.on('progress', (progress) => {
            const percent = Math.floor((progress.entries.processed / fileCount) * 100);
            if (percent >= lastReported + 10) {
                console.log(`📦 打包进度: ${percent}% (${progress.entries.processed}/${fileCount})`);
                lastReported = percent;
            }
        });

        // 连接输出流
        archive.pipe(output);

        // 添加 remote 目录内容（不包含 remote 目录本身）
        archive.directory(REMOTE_PATH, false);

        // 完成打包
        archive.finalize();
    });
}

// 生成版本信息文件
function generateVersionInfo() {
    const versionInfo = {
        version: '1.0.0',
        buildTime: new Date().toISOString(),
        zipHash: '' // 可选：计算 ZIP 的 MD5
    };

    // 确保 remote 目录存在
    if (!fs.existsSync(REMOTE_PATH)) {
        console.warn('⚠️ remote 目录不存在，跳过版本信息生成');
        return;
    }

    const versionPath = path.join(REMOTE_PATH, 'version.json');
    fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
    console.log('📝 版本信息已生成:', versionPath);
}

// 主函数
async function main() {
    console.log('');
    console.log('=====================================');
    console.log('   W-Game ZIP 打包工具 v1.0');
    console.log('=====================================');
    console.log('');

    try {
        generateVersionInfo();
        await buildZip();
        console.log('');
        console.log('=====================================');
        console.log('   打包完成！');
        console.log('=====================================');
    } catch (error) {
        console.error('❌ 执行失败:', error);
        process.exit(1);
    }
}

main();
