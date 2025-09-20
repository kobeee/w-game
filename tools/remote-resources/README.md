# W-Game 资源服务器

🐳 简单的Docker资源服务器，专为微信小游戏设计。

## 快速部署

```bash
# 1. 运行部署脚本
./deploy.sh

# 2. 完成！
```

## 功能特点

- ✅ **安全**: 微信来源验证 + 访问频率限制
- ✅ **简单**: 一键部署，无复杂配置
- ✅ **缓存**: 7天缓存，减少重复下载
- ✅ **Docker**: 容器化部署，环境隔离

## 目录结构

```
remote-resources/
├── deploy.sh           # 一键部署脚本
├── docker-compose.yml  # Docker配置
├── Dockerfile          # 镜像构建
├── server.py           # Flask应用(自动生成)
├── requirements.txt    # Python依赖
├── .env               # 环境配置(自动生成)
└── assets/            # 游戏资源目录
    ├── bg/           # 背景图片
    ├── ui/           # UI资源
    └── audio/        # 音频文件
```

## 使用说明

### 部署后的URL

- 健康检查: `http://localhost:9090/health`
- 资源访问: `http://localhost:9090/assets/bg/game_bg.jpg`

### 基本管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

### 在Cocos Creator中使用

```typescript
// 加载远程资源
assetManager.loadRemote('http://your-server:9090/assets/bg/game_bg.jpg', (err, texture) => {
    if (!err) {
        // 使用texture
        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        sprite.spriteFrame = spriteFrame;
    }
});
```

## 安全配置

服务器默认只允许微信小游戏访问：
- `https://servicewechat.com`
- `https://minigame.vip.qq.com`

调试时可设置 `DEBUG=true` 关闭来源检查。

## 配置文件(.env)

```bash
FLASK_ENV=production        # 运行环境
DEBUG=false                # 调试模式(true关闭安全检查)
SECRET_KEY=auto-generated   # 安全密钥
RATE_LIMIT_PER_IP=60       # 每IP每分钟最大请求数
CACHE_MAX_AGE=604800       # 缓存时间(7天)
```

## 故障排除

1. **服务启动失败**
   ```bash
   docker-compose logs
   ```

2. **微信小游戏无法访问**
   - 检查服务器IP/域名是否正确
   - 确认防火墙开放9090端口

3. **资源404错误**
   - 检查文件是否在 `./assets/` 目录下
   - 确认文件路径大小写正确

就这么简单！🎉