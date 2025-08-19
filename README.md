# Claude to OpenAI Protocol Proxy

这是一个将 Anthropic Claude API 协议转换为 OpenAI API 协议的代理服务。让你可以使用 Claude Code 连接到 OpenAI API 或通义千问 API。

## 功能特性

- 🔄 协议转换：将 Claude API 格式转换为 OpenAI Chat API 格式
- 🌊 流式响应支持：完整的流式响应处理
- 🛡️ 错误处理：完善的错误处理和状态码映射
- 🎯 模型映射：自动映射 Claude 模型名到 OpenAI 模型
- 📊 健康检查：内置健康检查端点
- ⚡ 高性能：基于 Node.js 和 TypeScript 构建
- 🔑 Qwen CLI 支持：支持使用通义千问 CLI 的 OAuth 认证
- 🔄 自动 token 刷新：定时刷新访问 token 并更新配置文件
- 🔄 自动重试：对临时性错误（502, 503, 504, 429）自动重试
- 📝 详细错误信息：提供更友好的错误描述和建议

## 技术栈

- **Node.js** - 高性能的 JavaScript 运行时
- **TypeScript** - 类型安全的 JavaScript 超集
- **Express.js** - 轻量级 Web 框架
- **Axios** - HTTP 客户端库

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

### 3. 选择认证模式并运行

#### 模式一：OpenAI API 认证（默认）

**方法一：通过环境变量配置**

编辑 `.env` 文件，填入你的 OpenAI API 密钥：

```env
OPENAI_API_KEY=your_openai_api_key_here
# QWEN_CLI=false  # 或者注释掉这行
```

启动服务：
```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

**方法二：通过命令行参数**

```bash
# 开发模式 - 通过命令行传递 API Key
npm run dev -- --openai-api-key your_api_key_here

# 开发模式 - 指定自定义 API 端点（自动处理 /v1）
npm run dev -- --openai-api-key your_api_key_here --openai-base-url https://your-api-endpoint.com
# 或
npm run dev -- --openai-api-key your_api_key_here --openai-base-url https://your-api-endpoint.com/v1/
# 或
npm run dev -- --openai-api-key your_api_key_here --openai-base-url https://your-api-endpoint.com/v1

# 开发模式 - 指定自定义模型（覆盖默认映射）
npm run dev -- --openai-api-key your_api_key_here --model gpt-4

# 生产模式
npm run build
npm start -- --openai-api-key your_api_key_here --model gpt-4
```

#### 模式二：Qwen CLI 认证

确保你已经安装并配置了通义千问 CLI，并且 OAuth 凭据已保存在默认位置 `~/.qwen/oauth_creds.json` 或自定义路径。

启动服务：

**使用默认 OAuth 文件路径：**
```bash
# 开发模式
npm run start:qwen

# 或者通过命令行参数
npm run dev -- --qwen-cli

# 生产模式
npm run build:qwen
```

**使用自定义 OAuth 文件路径：**
```bash
# 通过命令行参数指定
npm run dev -- --qwen-cli --qwen-oauth-file /path/to/your/oauth_creds.json

# 通过环境变量指定
QWEN_CLI=true QWEN_OAUTH_FILE=/path/to/your/oauth_creds.json npm run dev
```

或者通过环境变量（.env 文件）：
```env
QWEN_CLI=true
QWEN_OAUTH_FILE=/path/to/your/oauth_creds.json
# OPENAI_API_KEY 不需要设置
```

## 使用方法

### 配置 Claude Code

在 Claude Code 中设置 API 端点：

```bash
# Claude Code 配置
export ANTHROPIC_API_URL=http://localhost:3000/v1
export ANTHROPIC_API_KEY=dummy-key
```

### API 端点

- `POST /v1/messages` - Claude 协议的消息端点
- `POST /v1/chat/completions` - 聊天补全（OpenAI 兼容）
- `GET /v1/models` - 模型列表
- `GET /health` - 健康检查

## 模型映射

### OpenAI API 模式

| Claude 模型 | OpenAI 模型 |
|-------------|-------------|
| claude-3-opus-20240229 | gpt-4 |
| claude-3-sonnet-20240229 | gpt-3.5-turbo |
| claude-3-haiku-20240307 | gpt-4-turbo |

### Qwen CLI 模式

所有 Claude 模型都会映射到 `qwen3-coder-plus`

## 架构说明

```
Claude Code
    ↓ (Claude Protocol)
Proxy Server (Node.js)
    ↓ (OpenAI Protocol)
OpenAI API / 通义千问 API
```

代理服务负责：
1. 接收 Claude 格式的请求
2. 转换为 OpenAI 格式
3. 转发到 OpenAI API 或通义千问 API
4. 接收响应并转换回 Claude 格式
5. 返回给 Claude Code

## 项目结构

```
src/
├── index.ts              # 主服务器文件
├── protocol-converter.ts # 协议转换逻辑
└── qwen-cli-manager.ts   # Qwen CLI 认证管理器
```

### 测试

运行测试脚本验证服务：

```bash
chmod +x test.sh
./test.sh
```

### 命令行参数

```bash
# 指定端口
npm run dev -- -p 8080

# 启用 Qwen CLI 模式
npm run dev -- --qwen-cli

# 指定自定义 OAuth 文件路径
npm run dev -- --qwen-cli --qwen-oauth-file /path/to/oauth_creds.json

# OpenAI 模式：指定 API Key
npm run dev -- --openai-api-key your_api_key_here

# OpenAI 模式：指定 Base URL
npm run dev -- --openai-base-url https://your-api-endpoint.com/v1

# OpenAI 模式：指定自定义模型
npm run dev -- --openai-api-key your_api_key_here --model gpt-4

# Qwen CLI 模式：指定自定义模型（覆盖默认的 qwen3-coder-plus）
npm run dev -- --qwen-cli --model qwen-turbo

# 组合使用
npm run dev -- -p 8080 --openai-api-key your_api_key_here --openai-base-url https://your-api-endpoint.com/v1 --model gpt-4
```

### Qwen CLI 配置

1. 首次使用前，请确保已经通过通义千问 CLI 完成了 OAuth 认证
2. 认证信息默认保存在 `~/.qwen/oauth_creds.json`
3. 你可以通过 `--qwen-oauth-file` 参数或 `QWEN_OAUTH_FILE` 环境变量指定自定义路径
4. 代理服务会自动读取 OAuth 文件，并定时刷新 token
5. Token 刷新后会自动更新配置文件

## 工作原理

### OpenAI API 模式
```
Claude Code → 代理服务 → OpenAI API
```

### Qwen CLI 模式
```
Claude Code → 代理服务 → 通义千问 API
```

在 Qwen CLI 模式下：
1. 代理服务读取 `~/.qwen/oauth_creds.json` 获取认证信息
2. 使用 access_token 调用通义千问 API
3. 在 token 过期前自动刷新
4. 刷新后的 token 保存回配置文件

### 扩展功能

你可以通过修改 `protocol-converter.ts` 来：
- 添加更多的模型映射
- 自定义消息转换逻辑
- 添加中间件功能
- 实现请求/响应日志

## OpenAI Base URL 自动处理

代理服务会自动规范化 `openai-base-url`，确保正确的 API 端点格式：

- 自动移除末尾的 `/`
- 自动添加缺失的 `/v1` 后缀

**示例：**
- `https://api.example.com` → `https://api.example.com/v1`
- `https://api.example.com/` → `https://api.example.com/v1`
- `https://api.example.com/v1/` → `https://api.example.com/v1`
- `https://api.example.com/v1` → `https://api.example.com/v1`

## 错误处理和重试机制

### 自动重试

代理服务会对以下临时性错误自动重试（最多 3 次）：
- **502 Bad Gateway** - 上游服务返回无效响应
- **503 Service Unavailable** - 上游服务暂时不可用
- **504 Gateway Timeout** - 上游服务响应超时
- **429 Too Many Requests** - 请求频率过高

重试采用指数退避策略，避免加重上游服务负担。

### 错误信息说明

- **503 Service Unavailable**: 上游服务可能暂时宕机或过载，请稍后重试
- **502 Bad Gateway**: 上游服务返回了无效响应
- **429 Rate Limit Exceeded**: 请求频率过高，请降低请求频率
- **401 Authentication Failed**: API 密钥错误或已过期
- **403 Access Denied**: 没有访问该资源的权限
- **404 Not Found**: 请求的端点或模型不存在

## 为什么选择 Node.js？

1. **流处理能力强** - 原生支持流式 HTTP 响应，完美匹配 Claude API 的流式需求
2. **JSON 处理友好** - JavaScript 原生支持 JSON，减少序列化/反序列化开销
3. **异步 I/O 高效** - 单线程事件循环适合高并发代理场景
4. **开发效率高** - 快速开发和部署

## 许可证

MIT