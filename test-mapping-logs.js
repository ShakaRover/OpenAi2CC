#!/usr/bin/env node

// 简单的测试脚本，用于验证模型映射日志
const axios = require('axios');
const { spawn } = require('child_process');

const serverUrl = 'http://localhost:29999';

async function testModelMapping() {
  console.log('🧪 开始测试模型映射日志...\n');
  
  // 测试 1: Claude 协议
  console.log('=== 测试 1: /v1/messages (Claude 协议) ===');
  try {
    const response1 = await axios.post(`${serverUrl}/v1/messages`, {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 10,
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ Claude 协议请求成功');
  } catch (error) {
    console.log('❌ Claude 协议请求失败（可能因为没有配置 API 密钥）');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 2: OpenAI 协议
  console.log('\n=== 测试 2: /v1/chat/completions (OpenAI 协议) ===');
  try {
    const response2 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ OpenAI 协议请求成功');
  } catch (error) {
    console.log('❌ OpenAI 协议请求失败（可能因为没有配置 API 密钥）');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 3: 未知模型
  console.log('\n=== 测试 3: 未知模型映射 ===');
  try {
    const response3 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'unknown-model-xyz',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 未知模型请求成功');
  } catch (error) {
    console.log('❌ 未知模型请求失败（可能因为没有配置 API 密钥）');
  }
  
  console.log('\n✨ 测试完成！请查看服务器控制台的模型映射日志输出。');
}

// 检查服务器是否运行
async function checkServer() {
  try {
    await axios.get(`${serverUrl}/health`);
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  // 检查服务器是否运行
  console.log('🔍 检查服务器状态...');
  const isRunning = await checkServer();
  
  if (!isRunning) {
    console.log('❌ 服务器未运行！请先运行 `npm run dev` 启动服务器');
    console.log('💡 提示：在另一个终端窗口运行：');
    console.log('   npm run dev');
    return;
  }
  
  console.log('✅ 服务器正在运行\n');
  
  // 运行测试
  await testModelMapping();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testModelMapping, checkServer };