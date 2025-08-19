#!/usr/bin/env node

// 测试模型映射优先级系统
const { ModelMappingManager } = require('./dist/model-mapping.js');

console.log('🎯 测试模型映射优先级系统');
console.log('========================\n');

// 创建管理器实例
const manager = new ModelMappingManager();

console.log('优先级说明：');
console.log('1. model-mapping 配置中的模式匹配（最高优先级）');
console.log('2. model-mapping 配置中的 defaultModel');
console.log('3. --model 参数（作为外部默认模型）');
console.log('4. 内置模型映射（最低优先级）\n');

// 测试配置：包含模式匹配和默认模型
const testConfig = {
  mappings: [
    { pattern: 'claude-3-5', target: 'GLM-4', type: 'contains' },
    { pattern: 'gpt-4', target: 'claude-3-opus-20240229', type: 'contains' }
  ],
  defaultModel: 'config-default-model'
};

// 加载配置
process.env.MODEL_MAPPINGS = JSON.stringify(testConfig);
manager.loadFromEnv('MODEL_MAPPINGS');

console.log('📋 当前配置：');
console.log('模式匹配规则：');
manager.getMappings().forEach((mapping, index) => {
  console.log(`  ${index + 1}. "${mapping.pattern}" (${mapping.type}) -> "${mapping.target}"`);
});
console.log(`默认模型：${manager.getDefaultModel()}\n`);

// 测试用例
const testCases = [
  {
    name: '模式匹配优先级最高',
    input: 'claude-3-5-sonnet',
    externalDefault: 'external-model',
    expected: 'GLM-4',
    reason: '匹配到模式 "claude-3-5"，优先级最高'
  },
  {
    name: '配置中的默认模型优先级高于外部默认模型',
    input: 'unknown-model',
    externalDefault: 'external-model',
    expected: 'config-default-model',
    reason: '配置中的 defaultModel 优先级高于 --model 参数'
  },
  {
    name: '只有外部默认模型时使用它',
    input: 'another-unknown',
    externalDefault: 'external-only-model',
    expected: 'external-only-model',
    reason: '当配置中没有默认模型时，使用外部默认模型',
    setup: () => manager.clearDefaultModel()
  },
  {
    name: '没有任何默认模型时返回原值',
    input: 'no-default-at-all',
    externalDefault: undefined,
    expected: 'no-default-at-all',
    reason: '没有任何配置时返回原始模型名',
    setup: () => manager.clearDefaultModel()
  }
];

// 运行测试
testCases.forEach((testCase, index) => {
  console.log(`=== 测试 ${index + 1}: ${testCase.name} ===`);
  console.log(`输入模型: ${testCase.input}`);
  console.log(`外部默认模型: ${testCase.externalDefault || '无'}`);
  
  // 执行测试前的设置
  if (testCase.setup) {
    testCase.setup();
  }
  
  const result = manager.mapModel(testCase.input, testCase.externalDefault);
  console.log(`输出结果: ${result}`);
  console.log(`期望结果: ${testCase.expected}`);
  console.log(`测试结果: ${result === testCase.expected ? '✅ 通过' : '❌ 失败'}`);
  console.log(`原因: ${testCase.reason}\n`);
  
  // 重置配置供下一个测试使用
  if (index < testCases.length - 1) {
    manager.setDefaultModel('config-default-model');
  }
});

console.log('🎯 优先级系统测试完成！');
console.log('\n💡 实际使用示例：');
console.log('npm run dev -- --model-mapping ./config.json --model fallback-model');
console.log('- 如果模型匹配 config.json 中的模式，使用模式映射的目标');
console.log('- 如果不匹配但 config.json 有 defaultModel，使用 defaultModel');
console.log('- 如果都没有，使用 --model 指定的 fallback-model');