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

#### 模式二：Qwen CLI 认证

确保你已经安装并配置了通义千问 CLI，并且 OAuth 凭据已保存在 `~/.qwen/oauth_creds.json`。

启动服务：
```bash
# 开发模式
npm run start:qwen

# 或者通过命令行参数
npm run dev -- --qwen-cli

# 生产模式
npm run build:qwen
```

或者通过环境变量：
```env
QWEN_CLI=true
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

# 组合使用
npm run dev -- -p 8080 --qwen-cli
```

### Qwen CLI 配置

1. 首次使用前，请确保已经通过通义千问 CLI 完成了 OAuth 认证
2. 认证信息会保存在 `~/.qwen/oauth_creds.json`
3. 代理服务会自动读取该文件，并定时刷新 token
4. Token 刷新后会自动更新配置文件

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

## 为什么选择 Node.js？

1. **流处理能力强** - 原生支持流式 HTTP 响应，完美匹配 Claude API 的流式需求
2. **JSON 处理友好** - JavaScript 原生支持 JSON，减少序列化/反序列化开销
3. **异步 I/O 高效** - 单线程事件循环适合高并发代理场景
4. **开发效率高** - 快速开发和部署

## 许可证

MIT