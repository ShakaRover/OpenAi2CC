import { ModelMappingManager } from './model-mapping';

// OpenAI 到 Claude API 协议映射

// OpenAI 工具定义
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

// OpenAI 工具调用
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
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
      content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }[];
}

// Claude 工具定义
export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema?: any;
}

// Claude 工具使用
export interface ClaudeToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

// Claude 工具结果
export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content?: string;
  is_error?: boolean;
}

// Claude 消息内容
export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeRequest {
  model: string;
  max_tokens?: number;
  temperature?: number;
  messages: ClaudeMessage[];
  stream?: boolean;
  tools?: ClaudeTool[];
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: any;
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

  /**
   * 生成工具调用ID
   */
  private static generateToolCallId(): string {
    return `call_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Claude 请求转换为 OpenAI 请求
  static claudeRequestToOpenAI(claudeReq: any, useQwenCLI: boolean = false, customModel?: string): any {
    const openAIMessages: OpenAIMessage[] = [];
    
    // 转换消息
    for (const message of claudeReq.messages) {
      if (message.role === 'user' || message.role === 'assistant') {
        const openAIMessage: OpenAIMessage = {
          role: message.role
        };

        // 处理消息内容
        if (typeof message.content === 'string') {
          // 简单文本消息 - 针对Qwen API做特殊处理
          const originalContent = message.content;
          // 如果包含大量系统提示信息，则大幅缩减
          if (originalContent.includes('system-reminder') && originalContent.length > 10000) {
            openAIMessage.content = '用户请求查看当前项目路径。';
          } else {
            openAIMessage.content = originalContent.length > 5000 
              ? originalContent.substring(0, 5000) + '...[truncated]'
              : originalContent;
          }
        } else if (Array.isArray(message.content)) {
          // 复杂消息内容（可能包含工具调用）
          const textParts: string[] = [];
          const toolCalls: OpenAIToolCall[] = [];

          for (const block of message.content) {
            switch (block.type) {
              case 'text':
                if (block.text) {
                  textParts.push(block.text);
                }
                break;
              case 'tool_use':
                // Claude 工具使用转换为 OpenAI 工具调用
                toolCalls.push({
                  id: block.id || this.generateToolCallId(),
                  type: 'function',
                  function: {
                    name: block.name || '',
                    arguments: JSON.stringify(block.input || {})
                  }
                });
                break;
              case 'tool_result':
                // 修复：Qwen API不支持tool类型消息，转换为user消息
                // 将工具结果包装为用户消息，格式：[Tool Result]: {result}
                // 限制内容长度避免请求过大
                const resultContent = block.content || '';
                const truncatedContent = resultContent.length > 1000 
                  ? resultContent.substring(0, 1000) + '...[truncated]'
                  : resultContent;
                openAIMessages.push({
                  role: 'user',
                  content: `[Tool Result]: ${truncatedContent}`
                });
                break;
            }
          }

          // 设置文本内容
          if (textParts.length > 0) {
            openAIMessage.content = textParts.join('\n');
          }

          // 设置工具调用
          if (toolCalls.length > 0) {
            openAIMessage.tool_calls = toolCalls;
          }
        }

        // 只有当消息有内容时才添加到结果中
        if (openAIMessage.content || openAIMessage.tool_calls) {
          openAIMessages.push(openAIMessage);
        }
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

    const result: any = {
      model: targetModel,
      messages: openAIMessages,
      max_tokens: claudeReq.max_tokens || 4096,
      temperature: claudeReq.temperature || 0.7,
      stream: claudeReq.stream || false
    };

    // 转换工具定义
    if (claudeReq.tools && claudeReq.tools.length > 0) {
      result.tools = claudeReq.tools.map((tool: ClaudeTool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {}
        }
      }));
    }

    // 转换工具选择
    if (claudeReq.tool_choice) {
      if (claudeReq.tool_choice.type === 'auto') {
        result.tool_choice = 'auto';
      } else if (claudeReq.tool_choice.type === 'any') {
        result.tool_choice = 'auto'; // OpenAI 没有 'any'，使用 'auto'
      } else if (claudeReq.tool_choice.type === 'tool' && claudeReq.tool_choice.name) {
        result.tool_choice = {
          type: 'function',
          function: { name: claudeReq.tool_choice.name }
        };
      }
    }

    return result;
  }

  // OpenAI 请求转换为 Claude 请求
  static openAIRequestToClaude(openAIReq: OpenAIRequest, useQwenCLI: boolean = false, customModel?: string): ClaudeRequest {
    const claudeMessages: ClaudeMessage[] = [];
    
    for (const message of openAIReq.messages) {
      if (message.role === 'system') {
        // Claude 不支持 system 角色，转换为用户消息
        claudeMessages.push({
          role: 'user',
          content: `System: ${message.content || ''}`
        });
      } else if (message.role === 'tool') {
        // 工具消息转换为 Claude 格式
        const toolResult: ClaudeToolResult = {
          type: 'tool_result',
          tool_use_id: message.tool_call_id || '',
          content: message.content || ''
        };
        claudeMessages.push({
          role: 'user',
          content: [toolResult]
        });
      } else if (message.role === 'user' || message.role === 'assistant') {
        const content: ClaudeContentBlock[] = [];
        
        // 添加文本内容
        if (message.content) {
          content.push({
            type: 'text',
            text: message.content
          });
        }
        
        // 添加工具调用
        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const toolCall of message.tool_calls) {
            const toolUse: ClaudeToolUse = {
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments)
            };
            content.push(toolUse);
          }
        }
        
        claudeMessages.push({
          role: message.role as 'user' | 'assistant',
          content: content.length === 1 && content[0].type === 'text' && content[0].text
            ? content[0].text // 简单文本消息
            : content // 复杂消息
        });
      }
    }

    const result: ClaudeRequest = {
      model: this.mapModel(openAIReq.model, useQwenCLI, customModel),
      max_tokens: openAIReq.max_tokens || 4096,
      temperature: openAIReq.temperature || 0.7,
      messages: claudeMessages,
      stream: openAIReq.stream || false
    };

    // 转换工具定义
    if (openAIReq.tools && openAIReq.tools.length > 0) {
      result.tools = openAIReq.tools.map((tool: OpenAITool) => {
        if (!tool.function) {
          console.error('Tool missing function property:', tool);
          throw new Error('Tool missing function property');
        }
        return {
          name: tool.function.name,
          description: tool.function.description || '',
          input_schema: tool.function.parameters || {}
        };
      });
    }

    // 转换工具选择
    if (openAIReq.tool_choice) {
      if (typeof openAIReq.tool_choice === 'string') {
        if (openAIReq.tool_choice === 'auto') {
          result.tool_choice = { type: 'auto' };
        } else if (openAIReq.tool_choice === 'none') {
          // Claude 没有显式的 'none' 选项，我们通过不设置 tool_choice 来实现
          // result.tool_choice 保持 undefined
        }
      } else if (openAIReq.tool_choice.type === 'function') {
        result.tool_choice = {
          type: 'tool',
          name: openAIReq.tool_choice.function.name
        };
      }
    }

    return result;
  }

  // Claude 响应转换为 OpenAI 响应
  static claudeResponseToOpenAI(claudeRes: ClaudeResponse): OpenAIResponse {
    const message: any = {
      role: 'assistant'
    };

    const textParts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];

    // 确保 content 是数组
    if (!Array.isArray(claudeRes.content)) {
      console.error('claudeRes.content 不是数组:', claudeRes.content);
      claudeRes.content = [];
    }

    // 处理响应内容
    for (const block of claudeRes.content) {
      switch (block.type) {
        case 'text':
          if (block.text) {
            textParts.push(block.text);
          }
          break;
        case 'tool_use':
          // Claude 工具使用转换为 OpenAI 工具调用
          toolCalls.push({
            id: block.id || this.generateToolCallId(),
            type: 'function',
            function: {
              name: block.name || '',
              arguments: JSON.stringify(block.input || {})
            }
          });
          break;
      }
    }

    // 设置消息内容
    if (textParts.length > 0) {
      message.content = textParts.join('\n');
    }

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    // 如果既没有文本也没有工具调用，设置空字符串
    if (!message.content && !message.tool_calls) {
      message.content = '';
    }

    return {
      id: claudeRes.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: claudeRes.model,
      choices: [{
        index: 0,
        message: message,
        finish_reason: claudeRes.stop_reason || 'stop'
      }]
    };
  }

  // OpenAI 响应转换为 Claude 响应
  static openAIResponseToClaude(openAIRes: OpenAIResponse): ClaudeResponse {
    const content: ClaudeContentBlock[] = [];
    const choice = openAIRes.choices?.[0];
    const message = choice?.message;
    
    if (message?.content) {
      content.push({
        type: 'text',
        text: message.content
      });
    }
    
    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        let parsedInput = {};
        try {
          parsedInput = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e: any) {
          console.error('Failed to parse tool arguments:', toolCall.function.arguments, 'Error:', e.message);
          parsedInput = { error: 'Failed to parse arguments', rawArguments: toolCall.function.arguments };
        }
        
        // 修复空参数问题 - 为Bash工具添加默认command参数
        if (toolCall.function.name === 'Bash' && (!parsedInput || Object.keys(parsedInput).length === 0)) {
          console.log('⚠️  Bash tool call with empty parameters, adding default command');
          parsedInput = { command: 'pwd', description: 'Get current directory' };
        }
        
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parsedInput
        });
      }
    }
    
    return {
      id: openAIRes.id,
      type: 'message',
      role: 'assistant',
      content: content,
      model: openAIRes.model,
      stop_reason: choice?.finish_reason
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