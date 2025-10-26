# 后端部署指南

## 🚀 一键部署（推荐）

### 前置准备

部署前，请确保以下条件满足：

#### 服务器环境
- **操作系统**：Ubuntu 20.04+ / Debian 10+ / CentOS 8+ / macOS（需 root/sudo 权限）
- **网络**：公网 IP 一个，80/443 端口未被占用

#### 工具和依赖
脚本会自动检查以下工具，如未安装会给出安装提示：

| 工具 | 版本 | 用途 |
|------|------|------|
| Docker | 19.03+ | 容器运行时 |
| Docker Compose | 1.25+ | 容器编排 |
| Nginx | 1.18+ | 反向代理 + IP 白名单 |
| OpenSSL | 任意版本 | 密钥生成 |
| curl | 任意版本 | HTTP 请求测试 |

**快速安装**（Ubuntu/Debian）：
```bash
sudo apt update
sudo apt install -y docker.io docker-compose nginx curl openssl
sudo systemctl start docker
sudo systemctl enable docker
```

#### ℹ️ 脚本会自动引导你配置

**脚本会一步步引导你输入以下信息，你无需事先准备。只需按脚本提示操作即可：**

1. **Gemini API Key** - 脚本会告诉你去哪里获取，然后让你粘贴
2. **后端服务地址:端口** - 你的后端服务运行的地址和端口（如 elvis1949.top:9100）

**脚本执行时会显示每一步的详细说明，类似这样：**

```
【1/2】Gemini API Key 配置
  📖 用途：用来调用 Google Gemini API 验证单词
  📌 获取步骤：
     1. 浏览器访问: https://aistudio.google.com/app/apikey
     2. 用 Google 账号登录
     3. 点击 'Create API key' 按钮
     4. 复制生成的密钥（以 AIza 开头）

  请粘贴你的 Gemini API Key: _

【2/2】后端服务地址配置
  📖 用途：Cloudflare Worker 转发请求到此地址
  📌 格式说明：
     • 域名:端口 (如: elvis1949.top:9100)
     • Nginx 将监听此端口接收 Worker 转发的请求

  请输入后端服务地址 (如: elvis1949.top:9100): _
```

**简单来说：你只需按照脚本的提示，一个问题一个问题地回答就行了。**

### 执行部署

```bash
# 进入后端目录
cd src/backend

# 赋予脚本执行权限
chmod +x deploy.sh

# 执行一键部署脚本
sudo ./deploy.sh  # Linux 需要 sudo，macOS 可能也需要
```

**脚本会自动完成以下操作**：

| 步骤 | 自动化内容 |
|------|----------|
| 1. 前置条件检查 | 检查操作系统、权限、工具、文件 |
| 2. 参数验证 | 验证 API Key、域名、IP 格式 |
| 3. 密钥生成 | 生成 128 位 API 签名密钥 |
| 4. 环境变量 | 创建 `.env` 文件（权限 600，保护敏感信息） |
| 5. Docker 启动 | 启动 FastAPI + Redis 容器 |
| 6. Nginx 配置 | 配置 IP 白名单 + 请求头验证 |
| 7. IP 自动更新 | 部署 Cloudflare IP 更新脚本 + 定时任务 |
| 8. 服务验证 | 验证所有服务运行正常 |
| 9. 配置保存 | 生成部署信息文件 |

### 部署结果

脚本执行完成后，你会看到：

1. **生成的文件**：
   - `.env` - 环境变量文件（包含 API 密钥，权限 600）
   - `deployment_info_<timestamp>.txt` - 部署信息备份

2. **输出的关键信息**：
   ```
   🔑 API 签名密钥: a1b2c3d4e5f6...（已保存到 .env）
   ⚠️ 接下来请在 Cloudflare Dashboard 完成以下配置...
   ```

3. **运行的服务**：
   - FastAPI：`http://localhost:8000`
   - Redis：`localhost:6379`
   - Nginx：监听指定端口（如 9100，接收 Worker 转发的请求）

### 部署后操作

#### 1️⃣ 验证后端服务运行（部署脚本已自动完成）

部署脚本会自动：
- ✅ 启动 FastAPI 容器（监听本地 8000 端口）
- ✅ 启动 Redis 缓存（监听本地 6379 端口）
- ✅ 配置 Nginx（监听指定端口，如 9100）
- ✅ 配置 Cloudflare IP 白名单
- ✅ 设置 IP 自动更新定时任务

你可以本地验证：
```bash
cd src/backend

# 检查容器运行状态
docker-compose ps

# 测试健康检查
curl http://localhost:8000/health
```

#### 2️⃣ 配置 Cloudflare Worker（你的 JS 脚本）

你的 Worker 脚本已经配置了路由规则：
```javascript
// /w-game-service -> http://elvis1949.top:9100/*
if (url.pathname.startsWith('/w-game-service')) {
    upstreamHost = 'elvis1949.top:9100';
    const newPath = url.pathname.replace('/w-game-service', '');
    upstreamUrlString = `http://${upstreamHost}${newPath}${url.search}`;
}
```

无需修改，Worker 会自动转发请求到你的后端。

#### 3️⃣ 验证三层防护工作正常

```bash
# 第一层 - Nginx IP 白名单：直接访问源 IP 应被拒绝
curl -v http://你的服务器IP:9100/health
# 预期: 403 Forbidden

# 第二层 - Cloudflare 请求头验证：缺少请求头应被拒绝
curl -v http://localhost:9100/api/validate-word
# 预期: 403 Missing CF-Connecting-IP header

# 第三层 - 签名验证：无效签名应被拒绝
curl -v http://localhost:9100/api/validate-word \
  -H "CF-Connecting-IP: 1.1.1.1" \
  -H "CF-RAY: test" \
  -H "Content-Type: application/json" \
  -d '{"word": "hello"}'
# 预期: 401 Unauthorized (缺少签名)
```

#### 4️⃣ 客户端配置

编辑 `src/cocos/assets/scripts/services/NetworkService.ts`：

```typescript
// 修改这一行为你的 Cloudflare Worker 域名 + /w-game-service 路径
private static readonly BASE_URL = 'https://你的Cloudflare域名/w-game-service';

// 示例:
// private static readonly BASE_URL = 'https://example.com/w-game-service';
```

完成后，客户端会自动：
- 从 `/api/config` 获取 API 密钥
- 生成 HMAC-SHA256 签名
- 添加 X-Signature 和 X-Timestamp 请求头
- 发送请求到后端

---

## 📝 手动部署（仅参考）

如果无法使用脚本，可手动执行以下步骤：

### 1. 环境变量

```bash
cd src/backend

# 复制模板
cp .env.example .env

# 编辑 .env，填入你的值
nano .env
```

`.env` 需要填写：
```
GEMINI_API_KEY=你的API Key
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
API_SECRET_KEY=openssl rand -hex 32 生成的结果
API_RATE_LIMIT=15
GLOBAL_RATE_LIMIT=2000
ALLOWED_ORIGINS=https://你的域名
LOG_LEVEL=INFO
PORT=8000
```

### 2. 启动 Docker 服务

```bash
# 启动
docker-compose up -d

# 验证
docker-compose ps

# 应该看到两个容器运行中:
# w-game-word-validator (FastAPI)
# w-game-redis (Redis)
```

### 3. 配置 Nginx

```bash
# 复制配置文件
sudo cp nginx/word-validator.conf /etc/nginx/sites-available/

# 替换后端服务地址和端口（很重要！）
BACKEND_DOMAIN="elvis1949.top"      # 替换为你的后端域名
BACKEND_PORT="9100"                  # 替换为你的监听端口

sudo sed -i "s/your-backend-domain.com/$BACKEND_DOMAIN/g" \
  /etc/nginx/sites-available/word-validator.conf
sudo sed -i "s/listen 8000;/listen $BACKEND_PORT;/g" \
  /etc/nginx/sites-available/word-validator.conf

# 启用配置
sudo ln -s /etc/nginx/sites-available/word-validator.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 4. 配置 Cloudflare IP 自动更新

```bash
# 复制脚本
sudo cp nginx/update-cloudflare-ips.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/update-cloudflare-ips.sh

# 测试（首次更新）
sudo /usr/local/bin/update-cloudflare-ips.sh

# 配置定时任务（每周日 3:00 自动更新）
sudo crontab -e

# 添加这一行到 crontab:
# 0 3 * * 0 /usr/local/bin/update-cloudflare-ips.sh >> /var/log/cloudflare-ip-update.log 2>&1
```

---

## 🧪 验证部署

### 检查服务运行状态

```bash
# FastAPI 健康检查
curl http://localhost:8000/health

# 预期返回:
# {"status": "ok", "service": "word-validator", "redis": "connected"}
```

### 直接访问源 IP（应被拒绝）

```bash
curl -v https://你的服务器IP/api/validate-word

# 预期: 403 Forbidden（IP 不在 Cloudflare 白名单）
```

### 通过 Cloudflare 域名访问（应成功）

```bash
curl https://你的域名/health

# 预期: 200 OK
```

### 检查 Nginx 日志

```bash
# 查看 Nginx 访问日志
sudo tail -f /var/log/nginx/word-validator-access.log

# 预期看到来源 IP 为 Cloudflare IP（173.245.x.x 或其他 CF 段）
```

### 检查 FastAPI 日志

```bash
# 查看 FastAPI 日志
docker-compose logs -f word-validator

# 预期看到:
# [Security] ✅ Cloudflare 请求验证通过: CF-RAY=xxx, Client-IP=xxx
```

---

## 🔧 常见问题排查

### 问题 1：部署脚本报错

**症状**：脚本执行中断，显示错误信息

**排查步骤**：
```bash
# 1. 检查错误信息，按提示安装缺少的工具
# 2. 确保在 src/backend 目录下运行脚本
# 3. Linux 用户确保用 sudo 运行

# 重新运行
sudo ./deploy.sh
```

### 问题 2：Docker 容器启动失败

**症状**：`docker-compose ps` 显示容器状态为 Exit

**排查步骤**：
```bash
# 查看详细错误信息
docker-compose logs word-validator

# 检查 .env 文件是否正确
cat .env | grep GEMINI_API_KEY

# 重启容器
docker-compose down
docker-compose up -d
```

### 问题 3：Nginx 返回 403 Forbidden

**症状**：通过 Cloudflare 域名访问也返回 403

**排查步骤**：
```bash
# 更新 Cloudflare IP 列表
sudo /usr/local/bin/update-cloudflare-ips.sh

# 重载 Nginx
sudo systemctl reload nginx

# 查看 Nginx 日志
sudo tail -20 /var/log/nginx/word-validator-error.log
```

### 问题 4：签名验证失败（401）

**症状**：请求返回 401 Unauthorized

**排查步骤**：
```bash
# 检查客户端是否使用了正确的域名
grep BASE_URL src/cocos/assets/scripts/services/NetworkService.ts

# 查看 FastAPI 日志
docker-compose logs word-validator | grep -i signature

# 确保客户端和后端时间同步
date  # 查看服务器时间
```

### 问题 5：DNS 未生效

**症状**：`nslookup` 查询返回的 IP 不是 Cloudflare IP

**排查步骤**：
```bash
# 清除本地 DNS 缓存（macOS）
sudo dscacheutil -flushcache

# 清除本地 DNS 缓存（Linux）
sudo systemctl restart systemd-resolved

# 使用 Cloudflare DNS 强制查询
nslookup 你的域名 1.1.1.1

# 等待 DNS 生效（通常 5-10 分钟，有时需要 24 小时）
```

---

## 📋 部署检查清单

部署完成后，请逐项检查：

- [ ] Gemini API Key 已验证可用
- [ ] 服务器公网 IP 正确
- [ ] 后端域名已注册
- [ ] Docker 容器都在运行（`docker-compose ps`）
- [ ] `.env` 文件已创建，权限为 600
- [ ] Nginx 配置已加载（`sudo nginx -t`）
- [ ] Cloudflare 已添加站点
- [ ] DNS A 记录已创建（代理状态为"已代理"）
- [ ] SSL/TLS Encryption mode 已设置为 Flexible
- [ ] DNS 已生效（`nslookup` 返回 Cloudflare IP）
- [ ] `curl https://你的域名/health` 返回 200 OK
- [ ] 客户端 BASE_URL 已更新
- [ ] 签名密钥已保存到 .env

---

## 📚 快速命令参考

```bash
# === Docker 操作 ===
docker-compose ps              # 查看容器状态
docker-compose logs -f word-validator  # 查看 FastAPI 日志
docker-compose restart         # 重启服务
docker-compose down            # 停止服务

# === Nginx 操作 ===
sudo nginx -t                  # 测试 Nginx 配置
sudo systemctl reload nginx    # 重载 Nginx
sudo tail -f /var/log/nginx/word-validator-access.log  # 查看访问日志

# === 手动更新 Cloudflare IP ===
sudo /usr/local/bin/update-cloudflare-ips.sh

# === 验证测试 ===
curl http://localhost:8000/health         # 本地测试
curl https://你的域名/health              # 通过 Cloudflare 测试
nslookup 你的域名                          # 检查 DNS
```

---

## 技术支持

- **FastAPI 文档**：https://fastapi.tiangolo.com/
- **Cloudflare 文档**：https://developers.cloudflare.com/
- **Docker 文档**：https://docs.docker.com/
- **Nginx 文档**：https://nginx.org/en/docs/

---

**部署完成后，使用客户端的 `NetworkService.post()` 方法发送请求。密钥会自动从 `/api/config` 获取，无需手动配置。**
