#!/bin/bash

# ========================================
# Cloudflare IP 列表自动更新脚本
# 每周执行一次（通过 cron），更新 Nginx 配置中的 IP 白名单
# ========================================

set -e

NGINX_CONF="/etc/nginx/sites-available/word-validator.conf"
BACKUP_CONF="${NGINX_CONF}.backup"
TEMP_CONF="/tmp/word-validator-cf-ips.conf"

# 日志函数
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_message "开始获取最新 Cloudflare IP 列表..."

# 备份当前配置
cp "$NGINX_CONF" "$BACKUP_CONF"
log_message "已备份当前配置: $BACKUP_CONF"

# 获取 Cloudflare IPv4 列表
log_message "下载 Cloudflare IPv4 列表..."
CF_IPV4=$(curl -s https://www.cloudflare.com/ips-v4)
if [ -z "$CF_IPV4" ]; then
    log_message "❌ 错误：无法获取 IPv4 列表"
    exit 1
fi

# 获取 Cloudflare IPv6 列表
log_message "下载 Cloudflare IPv6 列表..."
CF_IPV6=$(curl -s https://www.cloudflare.com/ips-v6)
if [ -z "$CF_IPV6" ]; then
    log_message "❌ 错误：无法获取 IPv6 列表"
    exit 1
fi

log_message "✅ 成功获取 IP 列表"
log_message "  IPv4 数量: $(echo "$CF_IPV4" | wc -l)"
log_message "  IPv6 数量: $(echo "$CF_IPV6" | wc -l)"

# 生成新的 IP 白名单规则
log_message "生成 IP 白名单规则..."
{
    echo "    # ===== Cloudflare IP 白名单（自动更新于 $(date '+%Y-%m-%d %H:%M:%S')） ====="
    echo "    # Cloudflare IPv4"
    while IFS= read -r ip; do
        [ -n "$ip" ] && echo "    allow $ip;"
    done <<< "$CF_IPV4"
    echo ""
    echo "    # Cloudflare IPv6"
    while IFS= read -r ip; do
        [ -n "$ip" ] && echo "    allow $ip;"
    done <<< "$CF_IPV6"
    echo ""
    echo "    # 拒绝所有其他 IP"
    echo "    deny all;"
} > "$TEMP_CONF"

log_message "✅ 已生成临时配置"

# 提取配置文件中的前缀部分（包括 upstream 和 server 块开始）
head -n 17 "$BACKUP_CONF" > "$TEMP_CONF.full"

# 追加新的 IP 白名单部分
cat "$TEMP_CONF" >> "$TEMP_CONF.full"

# 追加 API 路由部分（从原始配置中提取）
tail -n +48 "$BACKUP_CONF" >> "$TEMP_CONF.full"

# 替换配置文件
cp "$TEMP_CONF.full" "$NGINX_CONF"
rm "$TEMP_CONF" "$TEMP_CONF.full"

log_message "✅ 已更新 Nginx 配置"

# 测试 Nginx 配置
log_message "验证 Nginx 配置..."
if nginx -t &>/dev/null; then
    log_message "✅ Nginx 配置验证通过"
else
    log_message "❌ 错误：Nginx 配置验证失败"
    log_message "恢复备份配置..."
    cp "$BACKUP_CONF" "$NGINX_CONF"
    exit 1
fi

# 重载 Nginx
log_message "重载 Nginx..."
systemctl reload nginx
log_message "✅ Nginx 已重载"

log_message "✅ 更新完成！"
