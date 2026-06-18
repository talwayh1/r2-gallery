#!/bin/bash
# 双 CDN 架构配置脚本
# 阿里云 CDN + Cloudflare

set -e

echo "=== 双 CDN 架构配置脚本 ==="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查必要的工具
check_requirements() {
    echo "检查必要工具..."

    if ! command -v curl &> /dev/null; then
        echo -e "${RED}错误: curl 未安装${NC}"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}警告: jq 未安装，将使用 python3 解析 JSON${NC}"
        JSON_PARSER="python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))'"
    else
        JSON_PARSER="jq ."
    fi

    echo -e "${GREEN}✓ 工具检查完成${NC}"
}

# 检查 Cloudflare 配置
check_cloudflare() {
    echo ""
    echo "检查 Cloudflare 配置..."

    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo -e "${RED}错误: CLOUDFLARE_API_TOKEN 未设置${NC}"
        echo "请设置环境变量: export CLOUDFLARE_API_TOKEN=your_token"
        exit 1
    fi

    if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
        echo -e "${YELLOW}警告: CLOUDFLARE_ZONE_ID 未设置，将尝试自动获取${NC}"
        # 尝试从 API 获取 Zone ID
        ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=zhangyubi.cn" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | \
            python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'])" 2>/dev/null)

        if [ -z "$ZONE_ID" ]; then
            echo -e "${RED}错误: 无法获取 Zone ID${NC}"
            exit 1
        fi

        echo -e "${GREEN}✓ 自动获取 Zone ID: $ZONE_ID${NC}"
    else
        ZONE_ID="$CLOUDFLARE_ZONE_ID"
    fi

    echo -e "${GREEN}✓ Cloudflare 配置检查完成${NC}"
}

# 检查当前状态
check_current_status() {
    echo ""
    echo "检查当前状态..."

    echo "1. 检查域名解析:"
    dig tu.zhangyubi.cn +short 2>/dev/null | head -3

    echo ""
    echo "2. 检查 Cloudflare 代理状态:"
    curl -sI "https://tu.zhangyubi.cn/" 2>&1 | grep -iE "cf-ray|server|cf-cache-status" | head -3

    echo ""
    echo "3. 检查当前性能:"
    curl -o /dev/null -s -w "TTFB: %{time_starttransfer}s\n" "https://tu.zhangyubi.cn/"

    echo -e "${GREEN}✓ 状态检查完成${NC}"
}

# 配置阿里云 CDN
setup_aliyun_cdn() {
    echo ""
    echo "=== 配置阿里云 CDN ==="
    echo ""
    echo "请按照以下步骤手动配置阿里云 CDN:"
    echo ""
    echo "1. 登录阿里云控制台: https://cdn.console.aliyun.com/"
    echo ""
    echo "2. 开通 CDN 服务"
    echo ""
    echo "3. 添加加速域名:"
    echo "   - 加速域名: tu.zhangyubi.cn"
    echo "   - 业务类型: 图片小文件"
    echo "   - 加速区域: 中国内地"
    echo "   - 源站类型: 域名"
    echo "   - 源站地址: tu.zhangyubi.cn"
    echo "   - 回源端口: 443"
    echo ""
    echo "4. 配置缓存规则:"
    echo "   - 文件类型: .js, .css, .html"
    echo "   - 缓存时间: 0天 (不缓存)"
    echo ""
    echo "   - 文件类型: .jpg, .png, .gif, .webp"
    echo "   - 缓存时间: 365天"
    echo ""
    echo "   - 文件类型: .mp4, .webm"
    echo "   - 缓存时间: 30天"
    echo ""
    echo "5. 配置 HTTPS:"
    echo "   - 证书来源: 上传证书"
    echo "   - 证书: 从 Cloudflare 获取"
    echo "   - 私钥: 从 Cloudflare 获取"
    echo ""
    echo "6. 获取 CNAME 地址:"
    echo "   - 添加域名后，阿里云会分配一个 CNAME 地址"
    echo "   - 格式: tu.zhangyubi.cn.cdn.dnsv1.com"
    echo ""
    echo -e "${YELLOW}请完成上述步骤后，按回车继续...${NC}"
    read -r
}

# 配置 DNS 智能解析
setup_dns_intelligence() {
    echo ""
    echo "=== 配置 DNS 智能解析 ==="
    echo ""
    echo "推荐使用 DNSPod (腾讯云):"
    echo ""
    echo "1. 注册 DNSPod: https://www.dnspod.cn/"
    echo ""
    echo "2. 添加域名: zhangyubi.cn"
    echo ""
    echo "3. 修改域名 DNS:"
    echo "   - 将域名的 NS 记录改为 DNSPod 提供的 NS:"
    echo "   - ns1.dnspod.net"
    echo "   - ns2.dnspod.net"
    echo ""
    echo "4. 配置智能解析:"
    echo ""
    echo "   海外用户解析到 Cloudflare:"
    echo "   - 记录类型: CNAME"
    echo "   - 主机记录: tu"
    echo "   - 记录值: tu.zhangyubi.cn"
    echo "   - 线路: 默认"
    echo "   - TTL: 600"
    echo ""
    echo "   中国用户解析到阿里云 CDN:"
    echo "   - 记录类型: CNAME"
    echo "   - 主机记录: tu"
    echo "   - 记录值: tu.zhangyubi.cn.cdn.dnsv1.com"
    echo "   - 线路: 国内"
    echo "   - TTL: 600"
    echo ""
    echo -e "${YELLOW}请完成上述步骤后，按回车继续...${NC}"
    read -r
}

# 测试配置
test_configuration() {
    echo ""
    echo "=== 测试配置 ==="
    echo ""

    echo "1. 测试中国访问:"
    echo "   使用在线工具测试:"
    echo "   - https://www.17ce.com/"
    echo "   - http://tool.chinaz.com/speedtest/"
    echo ""

    echo "2. 测试海外访问:"
    curl -o /dev/null -s -w "   TTFB: %{time_starttransfer}s\n" "https://tu.zhangyubi.cn/"

    echo ""
    echo "3. 检查 DNS 解析:"
    echo "   国内解析:"
    dig tu.zhangyubi.cn @114.114.114.114 +short 2>/dev/null | head -2
    echo ""
    echo "   海外解析:"
    dig tu.zhangyubi.cn @8.8.8.8 +short 2>/dev/null | head -2

    echo -e "${GREEN}✓ 配置测试完成${NC}"
}

# 生成配置报告
generate_report() {
    echo ""
    echo "=== 配置报告 ==="
    echo ""
    echo "域名: tu.zhangyubi.cn"
    echo "Cloudflare Zone ID: $ZONE_ID"
    echo ""
    echo "预期效果:"
    echo "- 中国访问延迟: 20-50ms"
    echo "- 海外访问延迟: 20-50ms"
    echo "- 缓存命中率: 90%+"
    echo ""
    echo "成本估算:"
    echo "- 阿里云 CDN: ¥100-300/月 (按流量)"
    echo "- DNSPod: ¥0 (免费版够用)"
    echo "- Cloudflare: ¥0 (免费版)"
    echo ""
    echo "监控工具:"
    echo "- 阿里云 CDN 控制台"
    echo "- Cloudflare Analytics"
    echo "- Google PageSpeed Insights"
    echo ""
    echo -e "${GREEN}✓ 配置完成！${NC}"
}

# 主函数
main() {
    echo "开始配置双 CDN 架构..."
    echo ""

    check_requirements
    check_cloudflare
    check_current_status
    setup_aliyun_cdn
    setup_dns_intelligence
    test_configuration
    generate_report
}

# 运行主函数
main
