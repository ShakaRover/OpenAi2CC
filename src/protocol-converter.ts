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

    // 确定目标模型
    let targetModel;
    if (customModel) {
      // 使用自定义模型
      targetModel = customModel;
    } else if (useQwenCLI) {
      // Qwen CLI 模式
      targetModel = 'qwen3-coder-plus';
    } else {
      // OpenAI 模式，使用映射
      targetModel = claudeReq.model;
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
    if (customModel) {
      // 使用自定义模型
      return customModel;
    }
    
    if (useQwenCLI) {
      // Qwen CLI 模式下只支持 qwen3-coder-plus
      return 'qwen3-coder-plus';
    }
    
    const modelMap: Record<string, string> = {
      'gpt-4': 'claude-3-opus-20240229',
      'gpt-4-turbo': 'claude-3-haiku-20240307',
      'gpt-3.5-turbo': 'claude-3-sonnet-20240229'
    };
    
    return modelMap[openAIModel] || 'claude-3-sonnet-20240229';
  }

  // 错误响应格式化（使用统一的错误处理器）
  static formatErrorResponse(error: any, statusCode: number = 500): any {
    // 导入错误处理器
    const { ErrorHandler } = require('./error-handler');
    const errorResponse = ErrorHandler.createErrorResponse(error, statusCode);
    return { error: errorResponse };
  }
}