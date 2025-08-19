#!/usr/bin/env node

// 测试默认模型功能
const { ModelMappingManager } = require('./dist/model-mapping.js');

console.log('🧪 测试默认模型功能\n');

// 创建管理器实例
const manager = new ModelMappingManager();

// 测试 1: 没有配置时的行为
console.log('=== 测试 1: 没有配置映射 ===');
console.log(`输入: 'unknown-model'`);
console.log(`输出: '${manager.mapModel('unknown-model')}'`);
console.log(`期望: 'unknown-model'（没有配置时返回原值）\n`);

// 测试 2: 加载配置（包含默认模型）
console.log('=== 测试 2: 加载包含默认模型的配置 ===');
const testConfig = {
  mappings: [
    { pattern: 'claude-3-5', target: 'GLM-4', type: 'contains' },
    { pattern: 'gpt-4', target: 'claude-3-opus-20240229', type: 'contains' }
  ],
  defaultModel: 'claude-3-sonnet-20240229'
};

// 模拟从环境变量加载
process.env.MODEL_MAPPINGS = JSON.stringify(testConfig);
manager.loadFromEnv('MODEL_MAPPINGS');

// 测试匹配的模型
console.log(`输入: 'claude-3-5-sonnet'`);
console.log(`输出: '${manager.mapModel('claude-3-5-sonnet')}'`);
console.log(`期望: 'GLM-4'（包含匹配）\n`);

// 测试不匹配的模型（应该使用默认模型）
console.log(`输入: 'completely-unknown-model'`);
console.log(`输出: '${manager.mapModel('completely-unknown-model')}'`);
console.log(`期望: 'claude-3-sonnet-20240229'（使用默认模型）\n`);

// 测试另一个不匹配的模型
console.log(`输入: 'some-random-ai'`);
console.log(`输出: '${manager.mapModel('some-random-ai')}'`);
console.log(`期望: 'claude-3-sonnet-20240229'（使用默认模型）\n`);

// 测试 3: 外部默认模型优先级测试
console.log('=== 测试 3: 外部默认模型优先级（--model 参数） ===');
console.log('配置文件中有默认模型，但测试外部默认模型');
console.log(`输入: 'external-test-model'`);
console.log(`输出: '${manager.mapModel('external-test-model', 'external-default-model')}'`);
console.log(`期望: 'claude-3-sonnet-20240229'（配置文件中的默认模型优先级高于外部默认模型）\n`);

// 测试 4: 只有外部默认模型的情况
console.log('=== 测试 4: 只有外部默认模型 ===');
// 清空配置文件中的默认模型
manager.clearDefaultModel();
console.log(`输入: 'external-only-test'`);
console.log(`输出: '${manager.mapModel('external-only-test', 'external-default-model')}'`);
console.log(`期望: 'external-default-model'（当配置文件中没有默认模型时使用外部默认模型）\n`);

// 测试 5: 动态设置默认模型
console.log('=== 测试 5: 动态设置默认模型 ===');
manager.setDefaultModel('gpt-3.5-turbo');
console.log(`输入: 'another-unknown-model'`);
console.log(`输出: '${manager.mapModel('another-unknown-model')}'`);
console.log(`期望: 'gpt-3.5-turbo'（使用新的默认模型）\n`);

// 测试 6: 清空默认模型
console.log('=== 测试 6: 清空默认模型 ===');
manager.clearDefaultModel();
console.log(`输入: 'final-unknown-model'`);
console.log(`输出: '${manager.mapModel('final-unknown-model')}'`);
console.log(`期望: 'final-unknown-model'（没有默认模型时返回原值）\n`);

console.log('✅ 所有测试完成！');