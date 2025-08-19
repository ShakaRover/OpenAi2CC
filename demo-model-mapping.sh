#!/bin/bash

# 模型映射功能演示脚本
# 此脚本展示如何使用新的模型映射功能

echo "🎯 模型映射功能演示"
echo "====================="

# 检查是否存在示例配置文件
if [ ! -f "model-mapping.example.json" ]; then
    echo "❌ 错误: 找不到 model-mapping.example.json 文件"
    exit 1
fi

echo "📋 示例配置文件内容:"
cat model-mapping.example.json
echo ""

# 启动服务器（在后台）
echo "🚀 启动服务器（启用模型映射）..."
npm run dev -- --model-mapping ./model-mapping.example.json &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 检查服务器是否运行
echo "🔍 检查服务器状态..."
curl -s http://localhost:29999/health | jq .

echo ""
echo "🧪 运行测试脚本..."
node test-mapping-logs.js

# 清理
echo ""
echo "🛑 停止服务器..."
kill $SERVER_PID 2>/dev/null

echo ""
echo "✨ 演示完成！"
echo ""
echo "💡 提示:"
echo "   1. 查看上面的服务器控制台输出，可以看到详细的模型映射日志"
echo "   2. 可以修改 model-mapping.example.json 来自定义映射规则"
echo "   3. 使用 DEBUG_MODEL_MAPPING=true 可以看到更多调试信息"