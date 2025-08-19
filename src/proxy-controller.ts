import { Request, Response } from 'express';
import { ProtocolConverter, OpenAIRequest } from './protocol-converter';
import { ApiService, RequestOptions } from './api-service';
import { ErrorHandler } from './error-handler';
import { qwenCLIManager } from './qwen-cli-manager';

export class ProxyController {
  private apiService: ApiService;
  private useQwenCLI: boolean;
  private customModel?: string;
  private openAIBaseURL: string;

  constructor(
    useQwenCLI: boolean = false,
    customModel?: string,
    openAIBaseURL: string = 'https://api.openai.com/v1'
  ) {
    this.apiService = new ApiService();
    this.useQwenCLI = useQwenCLI;
    this.customModel = customModel;
    this.openAIBaseURL = openAIBaseURL;
  }

  // 处理 Claude 协议的 messages 端点
  async handleMessages(req: Request, res: Response): Promise<void> {
    try {
      const claudeRequest = req.body;
      
      // 转换为 OpenAI 请求格式
      const openAIRequest = ProtocolConverter.claudeRequestToOpenAI(
        claudeRequest, 
        this.useQwenCLI, 
        this.customModel
      );
      
      // 准备请求头
      const headers = await this.apiService.getAuthHeaders(this.useQwenCLI);
      
      // 获取基础 URL
      const baseURL = this.useQwenCLI 
        ? qwenCLIManager.getResourceUrl() 
        : this.openAIBaseURL;
      
      if (!baseURL) {
        throw new Error('Resource URL not configured');
      }
      
      // 处理流式和非流式响应
      if (claudeRequest.stream) {
        await this.apiService.handleStreamingRequest(
          claudeRequest,
          openAIRequest,
          baseURL,
          headers,
          res,
          this.useQwenCLI
        );
      } else {
        const response = await this.apiService.makeRequestWithRetry({
          method: 'post',
          url: `${baseURL}/chat/completions`,
          data: openAIRequest,
          headers,
          responseType: 'json'
        }, { useQwenCLI: this.useQwenCLI });
        
        const claudeResponse = this.apiService.handleNonStreamingResponse(
          res,
          claudeRequest,
          response
        );
        
        res.json(claudeResponse);
      }
    } catch (error: any) {
      ErrorHandler.logError(error, '/v1/messages');
      const statusCode = error.response?.status || 500;
      const errorResponse = ErrorHandler.createErrorResponse(error, statusCode);
      res.status(statusCode).json({ error: errorResponse });
    }
  }

  // 处理 OpenAI 兼容的聊天补全端点
  async handleChatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const openAIRequest: OpenAIRequest = req.body;
      
      // 转换为 Claude 请求格式
      const claudeRequest = ProtocolConverter.openAIRequestToClaude(
        openAIRequest, 
        this.useQwenCLI, 
        this.customModel
      );
      
      // 准备请求头
      const headers = await this.apiService.getAuthHeaders(this.useQwenCLI);
      headers['anthropic-version'] = '2023-06-01';
      
      // 获取基础 URL
      const baseURL = this.useQwenCLI 
        ? qwenCLIManager.getResourceUrl() 
        : this.openAIBaseURL;
      
      if (!baseURL) {
        throw new Error('Resource URL not configured');
      }
      
      // 准备请求数据
      const requestData = {
        model: claudeRequest.model,
        messages: claudeRequest.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: claudeRequest.max_tokens,
        temperature: claudeRequest.temperature,
        stream: claudeRequest.stream
      };
      
      // 处理流式和非流式响应
      if (openAIRequest.stream) {
        await this.apiService.handleOpenAIStreamingResponse(
          openAIRequest,
          requestData,
          baseURL,
          headers,
          res
        );
      } else {
        const response = await this.apiService.makeRequestWithRetry({
          method: 'post',
          url: `${baseURL}/chat/completions`,
          data: requestData,
          headers,
          responseType: 'json'
        }, { useQwenCLI: this.useQwenCLI });
        
        const claudeResponse = this.apiService.handleNonStreamingResponse(
          res,
          claudeRequest,
          response
        );
        
        const openAIResponse = ProtocolConverter.claudeResponseToOpenAI(claudeResponse);
        res.json(openAIResponse);
      }
    } catch (error: any) {
      ErrorHandler.logError(error, '/v1/chat/completions');
      const statusCode = error.response?.status || 500;
      const errorResponse = ErrorHandler.createErrorResponse(error, statusCode);
      res.status(statusCode).json(ProtocolConverter.formatErrorResponse(error, statusCode));
    }
  }

  // 处理模型列表端点
  handleModels(req: Request, res: Response): void {
    let models;
    
    if (this.customModel) {
      // 如果指定了自定义模型，只返回该模型
      models = [
        {
          id: this.customModel,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'custom'
        }
      ];
    } else if (this.useQwenCLI) {
      // Qwen CLI 模式
      models = [
        {
          id: 'qwen3-coder-plus',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'qwen'
        }
      ];
    } else {
      // 默认 OpenAI 模式
      models = [
        {
          id: 'claude-3-opus-20240229',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic'
        },
        {
          id: 'claude-3-sonnet-20240229',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic'
        },
        {
          id: 'claude-3-haiku-20240307',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic'
        }
      ];
    }
    
    res.json({
      object: 'list',
      data: models
    });
  }

  // 处理健康检查
  handleHealthCheck(req: Request, res: Response): void {
    res.json({ 
      status: 'ok', 
      message: 'OpenAI to Claude Proxy is running',
      qwen_cli: this.useQwenCLI ? 'enabled' : 'disabled',
      qwen_configured: this.useQwenCLI ? qwenCLIManager.isConfigured() : false
    });
  }
}