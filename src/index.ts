import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import { Command } from 'commander';
import { ProtocolConverter, OpenAIRequest } from './protocol-converter';
import { qwenCLIManager } from './qwen-cli-manager';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 29999;

// 解析命令行参数
const program = new Command();
program
  .option('-p, --port <number>', 'server port', '29999')
  .option('--qwen-cli', 'use Qwen CLI for authentication')
  .parse(process.argv);

const options = program.opts();

// 中间件
app.use(cors());
app.use(express.json({ limit: '500mb' }));

// OpenAI API 基础 URL（配置你的 OpenAI 端点）
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Qwen CLI 模式
const useQwenCLI = options.qwenCli || process.env.QWEN_CLI === 'true';

// 健康检查
app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    message: 'OpenAI to Claude Proxy is running',
    qwen_cli: useQwenCLI ? 'enabled' : 'disabled',
    qwen_configured: useQwenCLI ? qwenCLIManager.isConfigured() : false
  });
});

// Claude 协议的 messages 端点
app.post('/v1/messages', async (req: Request, res: Response) => {
  try {
    const claudeRequest = req.body;
    
    // 转换为 OpenAI 请求格式
    const openAIRequest = ProtocolConverter.claudeRequestToOpenAI(claudeRequest, useQwenCLI);
    
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
    
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      openAIRequest,
      { 
        headers,
        responseType: claudeRequest.stream ? 'stream' : 'json'
      }
    );

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
    const claudeRequest = ProtocolConverter.openAIRequestToClaude(openAIRequest, useQwenCLI);
    
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
    
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        // 这里需要根据你的 OpenAI 接口进行调整
        model: claudeRequest.model,
        messages: claudeRequest.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: claudeRequest.max_tokens,
        temperature: claudeRequest.temperature,
        stream: claudeRequest.stream
      },
      { 
        headers,
        responseType: openAIRequest.stream ? 'stream' : 'json'
      }
    );

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
                const parsed = JSON.parse(data);
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
  // 根据 Qwen CLI 模式返回不同的模型列表
  const models = useQwenCLI ? [
    {
      id: 'qwen3-coder-plus',
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'qwen'
    }
  ] : [
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
      await qwenCLIManager.initialize();
      console.log('🔑 Qwen CLI mode enabled');
    } catch (error) {
      console.error('❌ Failed to initialize Qwen CLI:', error);
      process.exit(1);
    }
  }
  
  app.listen(port, () => {
    console.log(`🚀 OpenAI to Claude Proxy Server running on port ${port}`);
    console.log(`📝 Health check: http://localhost:${port}/health`);
    console.log(`🔗 API endpoint: http://localhost:${port}/v1/chat/completions`);
    if (useQwenCLI) {
      console.log(`🔐 Authentication: Qwen CLI OAuth`);
    } else {
      console.log(`🔐 Authentication: OpenAI API Key`);
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