#!/bin/bash

# 启动 Node.js 代理服务
echo "🚀 启动 OpenAI to Claude 代理服务..."
npm run dev &

# 等待服务启动
sleep 3

# 测试健康检查
echo -e "\n📝 测试健康检查..."
curl -s http://localhost:3000/health | jq .

# 测试模型列表
echo -e "\n📋 测试模型列表..."
curl -s http://localhost:3000/v1/models | jq '.data[].id'

# 测试聊天接口（非流式）
echo -e "\n💬 测试聊天接口..."
curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ],
    "max_tokens": 50
  }' | jq .

# 清理
echo -e "\n🛑 停止服务..."
pkill -f "ts-node src/index.ts"

echo -e "\n✅ 测试完成！"