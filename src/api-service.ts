import axios, { AxiosError } from 'axios';
import { ErrorHandler } from './error-handler';
import { ProtocolConverter, OpenAIRequest } from './protocol-converter';
import { qwenCLIManager } from './qwen-cli-manager';
import { RetryManager, RetryConfig } from './retry-manager';
import { logger } from './logger';

// 请求选项接口
export interface RequestOptions {
  useQwenCLI: boolean;
  customModel?: string;
  retryConfig?: Partial<RetryConfig>;
}

export class ApiService {
  private retryManager: RetryManager;
  
  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryManager = new RetryManager(retryConfig);
  }

  // 获取认证头
  async getAuthHeaders(useQwenCLI: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (useQwenCLI) {
      const accessToken = await qwenCLIManager.getAccessToken();
      if (!accessToken) {
        throw new Error('Qwen CLI authentication failed. Please check your OAuth credentials.');
      }
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return headers;
  }

  // 带重试的请求函数
  async makeRequestWithRetry(
    config: any,
    options: RequestOptions = { useQwenCLI: false }
  ): Promise<any> {
    const { useQwenCLI } = options;
    const startTime = Date.now();
    
    // 记录请求
    logger.logRequest(config.method?.toUpperCase() || 'POST', config.url, config.headers, config.data);
    
    return this.retryManager.executeWithRetry(async () => {
      // 每次重试都重新获取认证信息（对于 Qwen CLI，token 可能已刷新）
      if (useQwenCLI) {
        config.headers = await this.getAuthHeaders(useQwenCLI);
      }

      return await axios(config);
    }, 'API Request').finally(() => {
      // 记录响应时间（即使出错）
      const duration = Date.now() - startTime;
      logger.debug(`Request completed in ${duration}ms`, 'API Performance');
    });
  }

  // 处理流式响应
  async handleStreamingRequest(
    claudeRequest: any,
    openAIRequest: any,
    baseURL: string,
    headers: Record<string, string>,
    response: any,
    useQwenCLI: boolean
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    
    // 发送消息开始事件
    const { v4: uuidv4 } = await import('uuid');
    response.write(`event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: uuidv4(),
        type: 'message',
        role: 'assistant',
        content: [],
        model: claudeRequest.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      }
    })}\n\n`);
    
    // 发送内容块开始事件
    response.write(`event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: ''
      }
    })}\n\n`);
    
    let contentBuffer = '';
    
    return new Promise((resolve, reject) => {
      const axiosResponse = claudeRequest.stream 
        ? axios.post(
            `${baseURL}/chat/completions`,
            openAIRequest,
            { 
              headers,
              responseType: 'stream'
            }
          )
        : this.makeRequestWithRetry({
            method: 'post',
            url: `${baseURL}/chat/completions`,
            data: openAIRequest,
            headers,
            responseType: 'json'
          }, { useQwenCLI });

      axiosResponse.then(resp => {
        resp.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                // 发送内容块结束事件
                response.write(`event: content_block_stop\ndata: ${JSON.stringify({
                  type: 'content_block_stop',
                  index: 0
                })}\n\n`);
                
                // 发送消息结束事件
                response.write(`event: message_stop\ndata: ${JSON.stringify({
                  type: 'message_stop'
                })}\n\n`);
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    contentBuffer += parsed.choices[0].delta.content;
                    response.write(`event: content_block_delta\ndata: ${JSON.stringify({
                      type: 'content_block_delta',
                      index: 0,
                      delta: { type: 'text_delta', text: parsed.choices[0].delta.content }
                    })}\n\n`);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        });
        
        resp.data.on('end', () => {
          response.end();
          resolve();
        });
        
        resp.data.on('error', (error: any) => {
          reject(error);
        });
      }).catch(reject);
    });
  }

  // 处理非流式响应
  handleNonStreamingResponse(
    response: any,
    claudeRequest: any,
    openAIResponse: any
  ): any {
    return {
      id: openAIResponse.data.id || response.data.id,
      type: 'message',
      role: 'assistant',
      content: [{ 
        type: 'text', 
        text: openAIResponse.data.choices?.[0]?.message?.content || '' 
      }],
      model: openAIResponse.data.model || claudeRequest.model,
      stop_reason: openAIResponse.data.choices?.[0]?.finish_reason === 'stop' 
        ? 'end_turn' 
        : openAIResponse.data.choices?.[0]?.finish_reason
    };
  }

  // 处理 OpenAI 兼容的流式响应
  async handleOpenAIStreamingResponse(
    openAIRequest: OpenAIRequest,
    requestData: any,
    baseURL: string,
    headers: Record<string, string>,
    response: any
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    
    const axiosResponse = await axios.post(
      `${baseURL}/chat/completions`,
      requestData,
      { 
        headers,
        responseType: 'stream'
      }
    );
    
    return new Promise((resolve, reject) => {
      axiosResponse.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              response.write(`data: [DONE]\n\n`);
            } else {
              try {
                JSON.parse(data); // 验证 JSON 格式
                // 直接转发 OpenAI 格式的流式响应
                response.write(`data: ${data}\n\n`);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      });
      
      axiosResponse.data.on('end', () => {
        response.end();
        resolve();
      });
      
      axiosResponse.data.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  // 处理 OpenAI 兼容的非流式响应
  handleOpenAINonStreamingResponse(
    claudeResponse: any,
    openAIResponse: any
  ): any {
    return ProtocolConverter.claudeResponseToOpenAI(claudeResponse);
  }
}