import * as fs from 'fs';
import * as path from 'path';

export interface ModelMapping {
  pattern: string;
  target: string;
  type: 'contains' | 'exact' | 'prefix' | 'suffix';
}

export interface ModelMappingConfig {
  mappings: ModelMapping[];
  defaultModel?: string;
}

export class ModelMappingManager {
  private mappings: ModelMapping[] = [];
  private configFile: string | null = null;
  private defaultModel: string | null = null;

  constructor() {}

  /**
   * 从 JSON 文件加载模型映射配置
   * @param filePath 配置文件路径
   * @param strict 是否严格模式（如果为 true，文件不存在会抛出错误）
   */
  loadFromFile(filePath: string, strict: boolean = false): void {
    this.configFile = filePath;
    
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        if (strict) {
          throw new Error(`Model mapping config file not found: ${filePath}`);
        }
        console.warn(`⚠️  Model mapping config file not found: ${filePath}`);
        return;
      }

      // 读取并解析 JSON 文件
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(fileContent);

      // 验证配置格式
      if (!config.mappings || !Array.isArray(config.mappings)) {
        throw new Error('Invalid model mapping config: "mappings" must be an array');
      }

      // 解析映射规则
      this.mappings = config.mappings.map((mapping: any, index: number) => {
        if (!mapping.pattern || !mapping.target) {
          throw new Error(`Invalid mapping at index ${index}: both "pattern" and "target" are required`);
        }

        return {
          pattern: mapping.pattern,
          target: mapping.target,
          type: mapping.type || 'contains' // 默认使用包含匹配
        };
      });

      // 设置默认模型
      if (config.defaultModel && typeof config.defaultModel === 'string') {
        this.defaultModel = config.defaultModel;
        console.log(`🎯 Default model set to: ${this.defaultModel}`);
      }

      console.log(`✅ Loaded ${this.mappings.length} model mappings from ${filePath}`);
      
      // 记录所有映射规则（仅在调试模式下）
      if (process.env.DEBUG_MODEL_MAPPING === 'true') {
        console.log('📋 Model mappings:');
        this.mappings.forEach((mapping, index) => {
          console.log(`   ${index + 1}. "${mapping.pattern}" (${mapping.type}) -> "${mapping.target}"`);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (strict) {
        throw new Error(`Failed to load model mapping config: ${errorMessage}`);
      }
      console.error(`❌ Failed to load model mapping config: ${errorMessage}`);
      this.mappings = [];
    }
  }

  /**
   * 从环境变量加载模型映射配置
   * @param envVar 环境变量名
   */
  loadFromEnv(envVar: string = 'MODEL_MAPPINGS'): void {
    const mappingsJson = process.env[envVar];
    if (!mappingsJson) {
      console.warn(`⚠️  Environment variable ${envVar} not found or empty`);
      return;
    }

    try {
      const config = JSON.parse(mappingsJson);
      
      if (!config.mappings || !Array.isArray(config.mappings)) {
        throw new Error('Invalid model mapping config: "mappings" must be an array');
      }

      this.mappings = config.mappings.map((mapping: any, index: number) => {
        if (!mapping.pattern || !mapping.target) {
          throw new Error(`Invalid mapping at index ${index}: both "pattern" and "target" are required`);
        }

        return {
          pattern: mapping.pattern,
          target: mapping.target,
          type: mapping.type || 'contains'
        };
      });

      // 设置默认模型
      if (config.defaultModel && typeof config.defaultModel === 'string') {
        this.defaultModel = config.defaultModel;
        console.log(`🎯 Default model set to: ${this.defaultModel}`);
      }

      console.log(`✅ Loaded ${this.mappings.length} model mappings from environment variable ${envVar}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to load model mappings from environment: ${errorMessage}`);
      this.mappings = [];
    }
  }

  /**
   * 根据模型名称查找映射
   * @param modelName 原始模型名称
   * @param externalDefaultModel 外部提供的默认模型（来自 --model 参数）
   * @returns 映射后的模型名称，如果没有匹配则返回原始名称
   */
  mapModel(modelName: string, externalDefaultModel?: string): string {
    // 如果没有配置映射，直接返回原始名称
    if (this.mappings.length === 0) {
      return modelName;
    }

    // 按顺序检查每个映射规则
    for (const mapping of this.mappings) {
      let isMatch = false;

      switch (mapping.type) {
        case 'contains':
          isMatch = modelName.includes(mapping.pattern);
          break;
        case 'exact':
          isMatch = modelName === mapping.pattern;
          break;
        case 'prefix':
          isMatch = modelName.startsWith(mapping.pattern);
          break;
        case 'suffix':
          isMatch = modelName.endsWith(mapping.pattern);
          break;
        default:
          console.warn(`⚠️  Unknown mapping type: ${mapping.type}`);
          continue;
      }

      if (isMatch) {
        console.log(`🔄 Model mapped: "${modelName}" -> "${mapping.target}" (${mapping.type} match: "${mapping.pattern}")`);
        return mapping.target;
      }
    }

    // 没有找到匹配，检查默认模型的优先级
    // 1. 首先使用配置文件中的默认模型
    if (this.defaultModel) {
      console.log(`🎯 No pattern matched for "${modelName}", using default model from config: ${this.defaultModel}`);
      return this.defaultModel;
    }
    
    // 2. 如果配置文件中没有默认模型，使用外部提供的默认模型（--model 参数）
    if (externalDefaultModel) {
      console.log(`🎯 No pattern matched and no default model in config, using default model from --model: ${externalDefaultModel}`);
      return externalDefaultModel;
    }

    // 没有找到匹配且没有默认模型
    return modelName;
  }

  /**
   * 获取所有映射规则
   */
  getMappings(): ModelMapping[] {
    return [...this.mappings];
  }

  /**
   * 检查是否有映射配置
   */
  hasMappings(): boolean {
    return this.mappings.length > 0;
  }

  /**
   * 清空所有映射
   */
  clear(): void {
    this.mappings = [];
  }

  /**
   * 添加单个映射规则
   */
  addMapping(pattern: string, target: string, type: ModelMapping['type'] = 'contains'): void {
    this.mappings.push({ pattern, target, type });
  }

  /**
   * 设置默认模型
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
    console.log(`🎯 Default model set to: ${model}`);
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(): string | null {
    return this.defaultModel;
  }

  /**
   * 检查是否有默认模型
   */
  hasDefaultModel(): boolean {
    return this.defaultModel !== null;
  }

  /**
   * 清空默认模型
   */
  clearDefaultModel(): void {
    this.defaultModel = null;
  }
}