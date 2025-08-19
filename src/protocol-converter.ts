import { ModelMappingManager } from './model-mapping';

// OpenAI 到 Claude API 协议映射
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeRequest {
  model: string;
  max_tokens?: number;
  temperature?: number;
  messages: ClaudeMessage[];
  stream?: boolean;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason?: string;
}

// 协议转换器
export class ProtocolConverter {
  // 全局模型映射管理器实例
  private static modelMappingManager: ModelMappingManager | null = null;

  /**
   * 设置模型映射管理器
   */
  static setModelMappingManager(manager: ModelMappingManager): void {
    this.modelMappingManager = manager;
  }

  /**
   * 获取模型映射管理器
   */
  static getModelMappingManager(): ModelMappingManager | null {
    return this.modelMappingManager;
  }

  // Claude 请求转换为 OpenAI 请求
  static claudeRequestToOpenAI(claudeReq: any, useQwenCLI: boolean = false, customModel?: string): any {
    const openAIMessages: any[] = [];
    
    for (const message of claudeReq.messages) {
      if (message.role === 'user' || message.role === 'assistant') {
        openAIMessages.push({
          role: message.role,
          content: typeof message.content === 'string' ? message.content : message.content[0].text
        });
      }
    }

    // 确定目标模型 - 按照新的优先级系统
    let targetModel;
    let mappingInfo = '';
    
    if (useQwenCLI) {
      // Qwen CLI 模式
      targetModel = 'qwen3-coder-plus';
      mappingInfo = '(Qwen CLI mode)';
    } else {
      // 使用模型映射管理器进行映射（优先级 1）
      if (this.modelMappingManager && this.modelMappingManager.hasMappings()) {
        const originalModel = claudeReq.model;
        targetModel = this.modelMappingManager.mapModel(originalModel, customModel);
        
        if (targetModel !== originalModel) {
          // 来自 pattern mapping
          mappingInfo = '(pattern mapping)';
        } else if (customModel) {
          // 来自 defaultModel（customModel 参数）
          targetModel = customModel;
          mappingInfo = '(default model from --model)';
        } else {
          // 没有映射，使用原始模型
          mappingInfo = '(no mapping)';
        }
      } else if (customModel) {
        // 没有 model-mapping 配置，使用 customModel 作为默认模型
        targetModel = customModel;
        mappingInfo = '(default model from --model)';
      } else {
        // OpenAI 模式，直接使用原始模型
        targetModel = claudeReq.model;
        mappingInfo = '(direct mapping)';
      }
    }

    return {
      model: targetModel,
      messages: openAIMessages,
      max_tokens: claudeReq.max_tokens || 4096,
      temperature: claudeReq.temperature || 0.7,
      stream: claudeReq.stream || false
    };
  }

  // OpenAI 请求转换为 Claude 请求
  static openAIRequestToClaude(openAIReq: OpenAIRequest, useQwenCLI: boolean = false, customModel?: string): ClaudeRequest {
    const claudeMessages: ClaudeMessage[] = [];
    
    for (const message of openAIReq.messages) {
      if (message.role === 'system') {
        // Claude 不支持 system 角色，转换为用户消息
        claudeMessages.push({
          role: 'user',
          content: `System: ${message.content}`
        });
      } else {
        claudeMessages.push({
          role: message.role as 'user' | 'assistant',
          content: message.content
        });
      }
    }

    return {
      model: this.mapModel(openAIReq.model, useQwenCLI, customModel),
      max_tokens: openAIReq.max_tokens || 4096,
      temperature: openAIReq.temperature || 0.7,
      messages: claudeMessages,
      stream: openAIReq.stream || false
    };
  }

  // Claude 响应转换为 OpenAI 响应
  static claudeResponseToOpenAI(claudeRes: ClaudeResponse): OpenAIResponse {
    return {
      id: claudeRes.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: claudeRes.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: claudeRes.content[0]?.text || ''
        },
        finish_reason: claudeRes.stop_reason || 'stop'
      }]
    };
  }

  // 模型名称映射
  static mapModel(openAIModel: string, useQwenCLI: boolean = false, customModel?: string): string {
    if (useQwenCLI) {
      // Qwen CLI 模式下只支持 qwen3-coder-plus
      return 'qwen3-coder-plus';
    }
    
    // 使用模型映射管理器进行映射（优先级 1）
    if (this.modelMappingManager && this.modelMappingManager.hasMappings()) {
      const targetModel = this.modelMappingManager.mapModel(openAIModel, customModel);
      if (targetModel !== openAIModel) {
        return targetModel;
      }
    }
    
    // 如果没有 model-mapping 配置，使用 customModel 作为默认模型（优先级 2）
    if (customModel) {
      return customModel;
    }
    
    // 如果都没有，使用默认映射表（优先级 3）
    const modelMap: Record<string, string> = {
      'gpt-4': 'claude-3-opus-20240229',
      'gpt-4-turbo': 'claude-3-haiku-20240307',
      'gpt-3.5-turbo': 'claude-3-sonnet-20240229',
      'gpt-4o': 'claude-3-5-sonnet-20241022',
      'gpt-4o-mini': 'claude-3-haiku-20240307'
    };
    
    const mappedModel = modelMap[openAIModel];
    if (mappedModel) {
      return mappedModel;
    }
    
    // 如果没有找到映射，使用默认模型并记录警告
    console.warn(`⚠️  No mapping found for model '${openAIModel}', using default: claude-3-sonnet-20240229`);
    return 'claude-3-sonnet-20240229';
  }

  // 错误响应格式化（使用统一的错误处理器）
  static formatErrorResponse(error: any, statusCode: number = 500): any {
    // 导入错误处理器
    const { ErrorHandler } = require('./error-handler');
    const errorResponse = ErrorHandler.createErrorResponse(error, statusCode);
    return { error: errorResponse };
  }
}