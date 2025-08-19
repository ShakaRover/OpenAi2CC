import express, { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import cors from 'cors';
import { Command } from 'commander';
import { ProtocolConverter, OpenAIRequest } from './protocol-converter';
import { qwenCLIManager } from './qwen-cli-manager';
import { ModelMappingManager } from './model-mapping';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 29999;

// 解析命令行参数
const program = new Command();
program
  .option('-p, --port <number>', 'server port', '29999')
  .option('--qwen-cli', 'use Qwen CLI for authentication')
  .option('--qwen-oauth-file <path>', 'path to Qwen OAuth credentials file')
  .option('--openai-api-key <key>', 'OpenAI API key')
  .option('--openai-base-url <url>', 'OpenAI API base URL')
  .option('--model <model>', 'specify target model (overrides default mapping)')
  .option('--model-mapping <path>', 'path to model mapping JSON configuration file')
  .option('--model-mapping-env <var>', 'environment variable name for model mapping JSON')
  .parse(process.argv);

const options = program.opts();

// 中间件
app.use(cors());
app.use(express.json({ limit: '500mb' }));

// OpenAI API 基础 URL（配置你的 OpenAI 端点）
const rawOpenAIBaseUrl = options.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// 规范化 OpenAI Base URL，自动处理末尾的 / 和 /v1
function normalizeOpenAIBaseURL(url: string): string {
  let normalized = url.trim();
  
  // 移除末尾的 /
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  // 如果不以 /v1 结尾，则添加
  if (!normalized.endsWith('/v1')) {
    normalized += '/v1';
  }
  
  return normalized;
}

const OPENAI_BASE_URL = normalizeOpenAIBaseURL(rawOpenAIBaseUrl);
const OPENAI_API_KEY = options.openaiApiKey || process.env.OPENAI_API_KEY;

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒
const RETRYABLE_STATUS_CODES = [502, 503, 504, 429];

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的请求函数
async function makeRequestWithRetry(
  config: any,
  maxRetries: number = MAX_RETRIES
): Promise<any> {
  let lastError: AxiosError | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      lastError = error as AxiosError;
      
      // 检查是否应该重试
      const statusCode = (error as AxiosError)?.response?.status;
      const shouldRetry = statusCode && RETRYABLE_STATUS_CODES.includes(statusCode);
      
      if (!shouldRetry || attempt === maxRetries) {
        throw error;
      }
      
      // 记录重试信息
      console.warn(`Request failed (attempt ${attempt}/${maxRetries}): ${statusCode} - Retrying in ${RETRY_DELAY}ms...`);
      
      // 等待后重试
      await delay(RETRY_DELAY * attempt); // 指数退避
    }
  }
  
  throw lastError || new Error('Unknown error occurred');
}

// Qwen CLI 模式
const useQwenCLI = options.qwenCli || process.env.QWEN_CLI === 'true';

// Qwen OAuth 文件路径
const qwenOAuthFile = options.qwenOauthFile || process.env.QWEN_OAUTH_FILE;

// 自定义模型
const customModel = options.model;

// 初始化模型映射管理器
const modelMappingManager = new ModelMappingManager();

// 从命令行参数加载模型映射配置
const modelMappingFile = options.modelMapping || process.env.MODEL_MAPPING_FILE;
if (modelMappingFile) {
  modelMappingManager.loadFromFile(modelMappingFile);
}

// 从环境变量加载模型映射配置
const modelMappingEnv = options.modelMappingEnv || process.env.MODEL_MAPPING_ENV || 'MODEL_MAPPINGS';
if (process.env[modelMappingEnv]) {
  modelMappingManager.loadFromEnv(modelMappingEnv);
}

// 设置模型映射管理器到协议转换器
ProtocolConverter.setModelMappingManager(modelMappingManager);

// 健康检查
app.get('/health', (_, res) => {
  const healthInfo = {
    status: 'ok', 
    message: 'OpenAI to Claude Proxy is running',
    qwen_cli: useQwenCLI ? 'enabled' : 'disabled',
    qwen_configured: useQwenCLI ? qwenCLIManager.isConfigured() : false,
    model_mapping: {
      enabled: modelMappingManager.hasMappings(),
      count: modelMappingManager.getMappings().length,
      config_file: modelMappingFile || null,
      env_var: modelMappingManager.hasMappings() && process.env[modelMappingEnv] ? modelMappingEnv : null,
      default_model: modelMappingManager.getDefaultModel()
    }
  };
  res.json(healthInfo);
});

// Claude 协议的 messages 端点
app.post('/v1/messages', async (req: Request, res: Response) => {
  try {
    const claudeRequest = req.body;
    
    // 转换为 OpenAI 请求格式
    const openAIRequest = ProtocolConverter.claudeRequestToOpenAI(claudeRequest, useQwenCLI, customModel);
    
    // 打印模型映射信息
    const originalModel = claudeRequest.model;
    const mappedModel = openAIRequest.model;
    console.log(`🔄 Claude Protocol - Request Model: ${originalModel} -> Mapped to: ${mappedModel}`);
    
    // 显示映射类型信息（基于新的优先级系统）
    if (useQwenCLI) {
      console.log(`🔧 Qwen CLI mode: using qwen3-coder-plus`);
    } else if (modelMappingManager.hasMappings()) {
      if (originalModel !== mappedModel) {
        // 检查是否是模式匹配
        const mapping = modelMappingManager.getMappings().find(m => {
          switch (m.type) {
            case 'contains': return originalModel.includes(m.pattern);
            case 'exact': return originalModel === m.pattern;
            case 'prefix': return originalModel.startsWith(m.pattern);
            case 'suffix': return originalModel.endsWith(m.pattern);
            default: return false;
          }
        });
        
        if (mapping) {
          console.log(`📊 Pattern mapping applied: "${mapping.pattern}" (${mapping.type}) -> "${mapping.target}"`);
        } else if (mappedModel === modelMappingManager.getDefaultModel()) {
          console.log(`🎯 Using default model from config: ${modelMappingManager.getDefaultModel()}`);
        } else if (customModel && mappedModel === customModel) {
          console.log(`📝 Using default model from --model parameter: ${customModel}`);
        }
      } else {
        console.log(`📝 No mapping applied: using original model`);
      }
    } else if (customModel) {
      console.log(`📝 Using model from --model parameter: ${customModel}`);
    } else {
      console.log(`📝 Direct mapping: using original model`);
    }
    
    // 准备请求头
    let headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // 根据模式选择认证方式
    if (useQwenCLI) {
      const accessToken = await qwenCLIManager.getAccessToken();
      if (!accessToken) {
        return res.status(401).json({
          error: {
            message: 'Qwen CLI authentication failed. Please check your OAuth credentials.',
            type: 'authentication_error',
            code: 401
          }
        });
      }
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      if (!OPENAI_API_KEY) {
        return res.status(401).json({
          error: {
            message: 'OpenAI API key not configured',
            type: 'authentication_error',
            code: 401
          }
        });
      }
      headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
    }

    // 转发请求到 OpenAI API
    const baseURL = useQwenCLI ? qwenCLIManager.getResourceUrl() : OPENAI_BASE_URL;
    if (!baseURL) {
      return res.status(500).json({
        error: {
          message: 'Resource URL not configured for Qwen CLI mode',
          type: 'configuration_error',
          code: 500
        }
      });
    }
    
    // 使用带重试的请求（流式响应不重试）
    const response = claudeRequest.stream 
      ? await axios.post(
          `${baseURL}/chat/completions`,
          openAIRequest,
          { 
            headers,
            responseType: 'stream'
          }
        )
      : await makeRequestWithRetry({
          method: 'post',
          url: `${baseURL}/chat/completions`,
          data: openAIRequest,
          headers,
          responseType: 'json'
        });

    // 转换响应格式
    if (claudeRequest.stream) {
      // 流式响应处理
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 发送消息开始事件
      res.write(`event: message_start\ndata: ${JSON.stringify({
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
      res.write(`event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: ''
        }
      })}\n\n`);
      
      let contentBuffer = '';
      
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // 发送内容块结束事件
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({
                type: 'content_block_stop',
                index: 0
              })}\n\n`);
              
              // 发送消息结束事件
              res.write(`event: message_stop\ndata: ${JSON.stringify({
                type: 'message_stop'
              })}\n\n`);
            } else {
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  contentBuffer += parsed.choices[0].delta.content;
                  res.write(`event: content_block_delta\ndata: ${JSON.stringify({
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
      
      response.data.on('end', () => {
        res.end();
      });
    } else {
      // 非流式响应
      const claudeResponse = {
        id: response.data.id || uuidv4(),
        type: 'message',
        role: 'assistant',
        content: [{ 
          type: 'text', 
          text: response.data.choices?.[0]?.message?.content || '' 
        }],
        model: response.data.model || claudeRequest.model,
        stop_reason: response.data.choices?.[0]?.finish_reason === 'stop' ? 'end_turn' : response.data.choices?.[0]?.finish_reason
      };
      
      res.json(claudeResponse);
    }
  } catch (error: any) {
    console.error('Proxy error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    });
  }
});

// OpenAI 兼容的聊天补全端点（保持向后兼容）
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const openAIRequest: OpenAIRequest = req.body;
    
    // 转换为 Claude 请求格式
    const claudeRequest = ProtocolConverter.openAIRequestToClaude(openAIRequest, useQwenCLI, customModel);
    
    // 打印模型映射信息
    const originalModel = openAIRequest.model;
    const mappedModel = claudeRequest.model;
    console.log(`🔄 OpenAI Protocol - Request Model: ${originalModel} -> Mapped to: ${mappedModel}`);
    
    // 显示映射类型信息（基于新的优先级系统）
    if (useQwenCLI) {
      console.log(`🔧 Qwen CLI mode: using qwen3-coder-plus`);
    } else if (modelMappingManager.hasMappings()) {
      if (originalModel !== mappedModel) {
        // 检查是否是模式匹配
        const mapping = modelMappingManager.getMappings().find(m => {
          switch (m.type) {
            case 'contains': return originalModel.includes(m.pattern);
            case 'exact': return originalModel === m.pattern;
            case 'prefix': return originalModel.startsWith(m.pattern);
            case 'suffix': return originalModel.endsWith(m.pattern);
            default: return false;
          }
        });
        
        if (mapping) {
          console.log(`📊 Pattern mapping applied: "${mapping.pattern}" (${mapping.type}) -> "${mapping.target}"`);
        } else if (mappedModel === modelMappingManager.getDefaultModel()) {
          console.log(`🎯 Using default model from config: ${modelMappingManager.getDefaultModel()}`);
        } else if (customModel && mappedModel === customModel) {
          console.log(`📝 Using default model from --model parameter: ${customModel}`);
        }
      } else {
        console.log(`📝 No mapping applied: using original model`);
      }
    } else if (customModel) {
      console.log(`📝 Using model from --model parameter: ${customModel}`);
    } else {
      console.log(`📝 Default mapping applied (built-in model map)`);
    }
    
    // 准备请求头
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    
    // 根据模式选择认证方式
    if (useQwenCLI) {
      const accessToken = await qwenCLIManager.getAccessToken();
      if (!accessToken) {
        return res.status(401).json({
          error: {
            message: 'Qwen CLI authentication failed. Please check your OAuth credentials.',
            type: 'authentication_error',
            code: 401
          }
        });
      }
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      if (!OPENAI_API_KEY) {
        return res.status(401).json({
          error: {
            message: 'OpenAI API key not configured',
            type: 'authentication_error',
            code: 401
          }
        });
      }
      headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
    }

    // 转发请求到 OpenAI（模拟 Claude 格式）
    // 在 Qwen CLI 模式下，使用配置文件中的 resource_url
    const baseURL = useQwenCLI ? qwenCLIManager.getResourceUrl() : OPENAI_BASE_URL;
    if (!baseURL) {
      return res.status(500).json({
        error: {
          message: 'Resource URL not configured for Qwen CLI mode',
          type: 'configuration_error',
          code: 500
        }
      });
    }
    
    // 使用带重试的请求（流式响应不重试）
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
    
    const response = openAIRequest.stream
      ? await axios.post(
          `${baseURL}/chat/completions`,
          requestData,
          { 
            headers,
            responseType: 'stream'
          }
        )
      : await makeRequestWithRetry({
          method: 'post',
          url: `${baseURL}/chat/completions`,
          data: requestData,
          headers,
          responseType: 'json'
        });

    // 转换响应格式
    if (openAIRequest.stream) {
      // 流式响应处理
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write(`data: [DONE]\n\n`);
            } else {
              try {
                JSON.parse(data); // 验证 JSON 格式
                // 直接转发 OpenAI 格式的流式响应
                res.write(`data: ${data}\n\n`);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      });
      
      response.data.on('end', () => {
        res.end();
      });
    } else {
      // 非流式响应
      const claudeResponse = {
        id: response.data.id || uuidv4(),
        type: 'message',
        role: 'assistant',
        content: [{ 
          type: 'text', 
          text: response.data.choices?.[0]?.message?.content || '' 
        }],
        model: response.data.model || claudeRequest.model,
        stop_reason: response.data.choices?.[0]?.finish_reason
      };
      
      const openAIResponse = ProtocolConverter.claudeResponseToOpenAI(claudeResponse);
      res.json(openAIResponse);
    }
  } catch (error: any) {
    console.error('Proxy error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json(ProtocolConverter.formatErrorResponse(error, statusCode));
  }
});

// 模型列表端点
app.get('/v1/models', (_, res) => {
  let models;
  
  if (customModel) {
    // 如果指定了自定义模型，只返回该模型
    models = [
      {
        id: customModel,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'custom'
      }
    ];
  } else if (useQwenCLI) {
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
});

// 启动服务器
async function startServer() {
  const port = parseInt(options.port) || PORT;
  
  // 如果使用 Qwen CLI，初始化管理器
  if (useQwenCLI) {
    try {
      await qwenCLIManager.initialize(qwenOAuthFile);
      console.log('🔑 Qwen CLI mode enabled');
      if (qwenOAuthFile) {
        console.log(`📁 Using OAuth file: ${qwenOAuthFile}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize Qwen CLI:', error);
      process.exit(1);
    }
  }
  
  app.listen(port, () => {
    console.log(`🚀 OpenAI to Claude Proxy Server running on port ${port}`);
    console.log(`📝 Health check: http://localhost:${port}/health`);
    console.log(`🔗 API endpoint: http://localhost:${port}/v1/chat/completions`);
    console.log(`📊 Log Level: ALL (console.log, console.warn, console.error)`);
    
    if (customModel) {
      console.log(`🤖 Custom Model: ${customModel}`);
    }
    
    // 显示模型映射配置信息
    if (modelMappingManager.hasMappings()) {
      console.log(`🗺️  Model Mapping: Enabled (${modelMappingManager.getMappings().length} rules)`);
      if (modelMappingFile) {
        console.log(`📁 Mapping Config: ${modelMappingFile}`);
      }
      if (process.env[modelMappingEnv]) {
        console.log(`🔧 Mapping Env: ${modelMappingEnv}`);
      }
      
      // 在调试模式下显示所有映射规则
      if (process.env.DEBUG_MODEL_MAPPING === 'true') {
        console.log(`\n📋 Active Mappings:`);
        modelMappingManager.getMappings().forEach((mapping, index) => {
          console.log(`   ${index + 1}. "${mapping.pattern}" (${mapping.type}) -> "${mapping.target}"`);
        });
        
        if (modelMappingManager.getDefaultModel()) {
          console.log(`\n🎯 Default Model: ${modelMappingManager.getDefaultModel()}`);
        }
      } else if (modelMappingManager.getDefaultModel()) {
        console.log(`🎯 Default Model: ${modelMappingManager.getDefaultModel()}`);
      }
    } else {
      console.log(`🗺️  Model Mapping: Disabled (using default mappings)`);
    }
    
    if (useQwenCLI) {
      console.log(`🔐 Authentication: Qwen CLI OAuth`);
    } else {
      console.log(`🔐 Authentication: OpenAI API Key`);
      console.log(`🌐 OpenAI Base URL: ${OPENAI_BASE_URL}`);
      if (rawOpenAIBaseUrl !== OPENAI_BASE_URL) {
        console.log(`📝 Original URL: ${rawOpenAIBaseUrl}`);
        console.log(`✅ Normalized to: ${OPENAI_BASE_URL}`);
      }
      if (options.openaiApiKey) {
        console.log(`🔑 API Key: provided via command line`);
      } else if (process.env.OPENAI_API_KEY) {
        console.log(`🔑 API Key: provided via environment variable`);
      }
    }
  });
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (useQwenCLI) {
    qwenCLIManager.cleanup();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  if (useQwenCLI) {
    qwenCLIManager.cleanup();
  }
  process.exit(0);
});

startServer();

export default app;