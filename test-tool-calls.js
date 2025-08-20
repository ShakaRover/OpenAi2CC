#!/usr/bin/env node

const { ProtocolConverter } = require('./dist/protocol-converter');

console.log('🔧 测试工具调用功能的协议转换');

// 测试数据：Claude 请求包含工具定义和工具调用
const claudeRequestWithTools = {
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  temperature: 0.7,
  tools: [
    {
      name: 'get_weather',
      description: '获取指定城市的天气信息',
      input_schema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称'
          }
        },
        required: ['city']
      }
    }
  ],
  tool_choice: { type: 'auto' },
  messages: [
    {
      role: 'user',
      content: '北京的天气怎么样？'
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '我来帮您查询北京的天气。'
        },
        {
          type: 'tool_use',
          id: 'call_weather_123',
          name: 'get_weather',
          input: { city: '北京' }
        }
      ]
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_weather_123',
          content: '北京今天晴天，气温22-28度'
        }
      ]
    }
  ]
};

// 测试数据：Claude 响应包含工具调用
const claudeResponseWithTools = {
  id: 'msg_123456',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: '让我查询一下天气信息。'
    },
    {
      type: 'tool_use',
      id: 'call_weather_456',
      name: 'get_weather',
      input: { city: '上海' }
    }
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'tool_use'
};

// 测试数据：OpenAI 请求包含工具定义和工具调用
const openAIRequestWithTools = {
  model: 'gpt-4',
  temperature: 0.7,
  max_tokens: 1024,
  tools: [
    {
      type: 'function',
      function: {
        name: 'calculate_sum',
        description: '计算两个数的和',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'number', description: '第一个数' },
            b: { type: 'number', description: '第二个数' }
          },
          required: ['a', 'b']
        }
      }
    }
  ],
  tool_choice: 'auto',
  messages: [
    {
      role: 'user',
      content: '计算 15 + 27 等于多少？'
    },
    {
      role: 'assistant',
      content: '我来计算一下。',
      tool_calls: [
        {
          id: 'call_calc_789',
          type: 'function',
          function: {
            name: 'calculate_sum',
            arguments: '{"a": 15, "b": 27}'
          }
        }
      ]
    },
    {
      role: 'tool',
      content: '42',
      tool_call_id: 'call_calc_789'
    }
  ]
};

console.log('\n=== 测试 1: Claude 请求转换为 OpenAI 请求 ===');
try {
  const convertedToOpenAI = ProtocolConverter.claudeRequestToOpenAI(claudeRequestWithTools);
  console.log('✅ Claude -> OpenAI 转换成功');
  console.log('转换结果：');
  console.log(JSON.stringify(convertedToOpenAI, null, 2));
  
  // 验证关键字段
  if (convertedToOpenAI.tools && convertedToOpenAI.tools.length > 0) {
    console.log('✅ 工具定义转换正确');
  }
  if (convertedToOpenAI.tool_choice) {
    console.log('✅ 工具选择转换正确');
  }
  if (convertedToOpenAI.messages.some(m => m.tool_calls)) {
    console.log('✅ 工具调用转换正确');
  }
  if (convertedToOpenAI.messages.some(m => m.role === 'tool')) {
    console.log('✅ 工具结果转换正确');
  }
} catch (error) {
  console.error('❌ Claude -> OpenAI 转换失败:', error.message);
}

console.log('\n=== 测试 2: OpenAI 请求转换为 Claude 请求 ===');
try {
  const convertedToClaude = ProtocolConverter.openAIRequestToClaude(openAIRequestWithTools);
  console.log('✅ OpenAI -> Claude 转换成功');
  console.log('转换结果：');
  console.log(JSON.stringify(convertedToClaude, null, 2));
  
  // 验证关键字段
  if (convertedToClaude.tools && convertedToClaude.tools.length > 0) {
    console.log('✅ 工具定义转换正确');
  }
  if (convertedToClaude.tool_choice) {
    console.log('✅ 工具选择转换正确');
  }
  if (convertedToClaude.messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_use'))) {
    console.log('✅ 工具调用转换正确');
  }
  if (convertedToClaude.messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'))) {
    console.log('✅ 工具结果转换正确');
  }
} catch (error) {
  console.error('❌ OpenAI -> Claude 转换失败:', error.message);
}

console.log('\n=== 测试 3: Claude 响应转换为 OpenAI 响应 ===');
try {
  const convertedResponse = ProtocolConverter.claudeResponseToOpenAI(claudeResponseWithTools);
  console.log('✅ Claude 响应 -> OpenAI 响应转换成功');
  console.log('转换结果：');
  console.log(JSON.stringify(convertedResponse, null, 2));
  
  // 验证关键字段
  const message = convertedResponse.choices[0].message;
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log('✅ 响应中的工具调用转换正确');
  }
  if (message.content) {
    console.log('✅ 响应中的文本内容转换正确');
  }
} catch (error) {
  console.error('❌ Claude 响应 -> OpenAI 响应转换失败:', error.message);
}

console.log('\n🎉 工具调用功能测试完成！');