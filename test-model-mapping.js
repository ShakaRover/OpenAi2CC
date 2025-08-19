// 测试模型映射日志输出
const axios = require('axios');

const serverUrl = 'http://localhost:29999';

async function testModelMapping() {
  console.log('🧪 测试模型映射日志输出...\n');
  
  // 测试 Claude 协议
  console.log('=== 测试 /v1/messages (Claude 协议) ===');
  try {
    const response1 = await axios.post(`${serverUrl}/v1/messages`, {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ Claude 协议请求成功\n');
  } catch (error) {
    console.log('❌ Claude 协议请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 测试 OpenAI 协议
  console.log('=== 测试 /v1/chat/completions (OpenAI 协议) ===');
  try {
    const response2 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ OpenAI 协议请求成功\n');
  } catch (error) {
    console.log('❌ OpenAI 协议请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
  
  // 测试未知模型
  console.log('=== 测试未知模型映射 ===');
  try {
    const response3 = await axios.post(`${serverUrl}/v1/chat/completions`, {
      model: 'unknown-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    });
    console.log('✅ 未知模型请求成功\n');
  } catch (error) {
    console.log('❌ 未知模型请求失败（预期行为，因为没有配置 API 密钥）\n');
  }
}

if (require.main === module) {
  testModelMapping().catch(console.error);
}

module.exports = { testModelMapping };