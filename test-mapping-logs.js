#!/usr/bin/env node

// 测试模型映射日志输出（包含新的模式匹配功能和默认模型）
const axios = require('axios');

const serverUrl = 'http://localhost:29999';

async function testModelMapping() {
  console.log('🧪 测试模型映射日志输出（包含模式匹配和默认模型）...\n');
  
  // 测试 1: Claude 协议
  console.log('=== 测试 1: /v1/messages (Claude 协议) ===');
  try {
    const response1 = await axios.post(`${serverUrl}/v1/messages`, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ Claude 协议请求成功\n');
  } catch (error) {
    console.log('❌ Claude 协议请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 2: OpenAI 协议
  console.log('=== 测试 2: /v1/chat/completions (OpenAI 协议) ===');
  try {
    const response2 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ OpenAI 协议请求成功\n');
  } catch (error) {
    console.log('❌ OpenAI 协议请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 3: 包含匹配模型
  console.log('=== 测试 3: 包含匹配模型 (claude-3-5) ===');
  try {
    const response3 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 包含匹配模型请求成功\n');
  } catch (error) {
    console.log('❌ 包含匹配模型请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 4: 前缀匹配模型
  console.log('=== 测试 4: 前缀匹配模型 (qwen-7b) ===');
  try {
    const response4 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'qwen-7b-chat',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 前缀匹配模型请求成功\n');
  } catch (error) {
    console.log('❌ 前缀匹配模型请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 5: 未知模型（测试默认模型）
  console.log('=== 测试 5: 未知模型（测试默认模型） ===');
  try {
    const response5 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'completely-unknown-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 未知模型请求成功（应该使用默认模型）\n');
  } catch (error) {
    console.log('❌ 未知模型请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 等待 2 秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 测试 6: 另一个未知模型
  console.log('=== 测试 6: 另一个未知模型 ===');
  try {
    const response6 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'some-random-ai-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 另一个未知模型请求成功（应该使用默认模型）\n');
  } catch (error) {
    console.log('❌ 另一个未知模型请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  console.log('✨ 测试完成！请查看服务器控制台的模型映射日志输出。');
  console.log('\n💡 提示：要启用模型映射，请使用 --model-mapping 参数或 MODEL_MAPPING_FILE 环境变量');
  console.log('   示例：npm run dev -- --model-mapping ./model-mapping.example.json');
  console.log('\n🎯 注意：现在的配置包含默认模型，所有不匹配的模型都会被映射到默认模型');
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
    console.log('\n🔧 要启用模型映射，请添加 --model-mapping 参数：');
    console.log('   npm run dev -- --model-mapping ./model-mapping.example.json');
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