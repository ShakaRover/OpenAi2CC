import express, { Request, Response } from 'express';
import cors from 'cors';
import { Command } from 'commander';
import { ProxyController } from './proxy-controller';
import { qwenCLIManager } from './qwen-cli-manager';

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

// Qwen CLI 模式
const useQwenCLI = options.qwenCli || process.env.QWEN_CLI === 'true';

// Qwen OAuth 文件路径
const qwenOAuthFile = options.qwenOauthFile || process.env.QWEN_OAUTH_FILE;

// 自定义模型
const customModel = options.model;

// 创建代理控制器
const proxyController = new ProxyController(useQwenCLI, customModel, OPENAI_BASE_URL);

// 路由
app.get('/health', (req: Request, res: Response) => {
  proxyController.handleHealthCheck(req, res);
});

app.post('/v1/messages', async (req: Request, res: Response) => {
  await proxyController.handleMessages(req, res);
});

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  await proxyController.handleChatCompletions(req, res);
});

app.get('/v1/models', (req: Request, res: Response) => {
  proxyController.handleModels(req, res);
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
    
    if (customModel) {
      console.log(`🤖 Custom Model: ${customModel}`);
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