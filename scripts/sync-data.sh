#!/bin/bash
# 数据同步脚本：验证 → 提交 → 推送
set -e

cd "$(dirname "$0")/.."

echo "📊 验证数据格式..."
node scripts/validate-communities.js

echo "🔍 检查变更..."
git diff --exit-code data/communities.json > /dev/null && echo "❌ 没有数据变更" && exit 0

echo "📝 生成变更摘要..."
node scripts/diff-communities.js

echo "✅ 提交变更..."
git add data/communities.json
git commit -m "chore: update communities data

$(node scripts/diff-communities.js --short)"

echo "🚀 推送到远程..."
git push origin main

echo "✅ 完成！Vercel 会自动部署（约 1-2 分钟）"
echo "🌐 访问: https://map.lihuiyang.xyz"
