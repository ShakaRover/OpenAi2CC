# OpenAi2CC：打破 Claude Code 的模型限制，让 AI 开发更自由

这是一个将 Anthropic Claude API 协议转换为 OpenAI API 协议的代理服务。让你可以使用 Claude Code 连接到 OpenAI API、通义千问 API 或其他兼容 OpenAI 协议的 AI 服务。

## 项目背景

作为开发者，你是否也曾遇到过这样的困扰：很喜欢用 Claude Code 写代码，但它的模型选择太有限了？OpenAi2CC 专门解决这个痛点，让你能够：

- 🔄 自由选择喜欢的 AI 模型
- 💰 根据需求平衡成本和性能
- 🏢 为团队提供统一的 AI 服务入口
- 🔧 灵活配置模型映射规则

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
- 📝 模型映射日志：实时显示请求模型和映射后的模型信息
- 🗺️ **高级模型映射**：支持 JSON 配置文件和模式匹配（包含、前缀、后缀、精确匹配）

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
export ANTHROPIC_API_URL=http://localhost:29999
export ANTHROPIC_API_KEY=dummy-key
```

**配置说明：**
- `ANTHROPIC_API_URL` 必须指向 OpenAi2CC 服务的地址和端口（默认：29999）
- `ANTHROPIC_API_KEY` 可以是任意值，因为实际的认证由代理服务处理
- 如果修改了服务端口，需要相应调整 URL 中的端口号
- 配置后，Claude Code 的所有请求都会通过 OpenAi2CC 转发到你配置的 AI 服务

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

## 模型映射日志

服务会在控制台实时显示模型映射信息，帮助你了解请求的模型是如何被转换的：

### Claude 协议示例
```
🔄 Claude Protocol - Request Model: claude-3-sonnet-20240229 -> Mapped to: claude-3-sonnet-20240229
📝 Using custom model override: gpt-4
🔧 Mode: OpenAI API
```

### OpenAI 协议示例
```
🔄 OpenAI Protocol - Request Model: gpt-4 -> Mapped to: claude-3-opus-20240229
🔧 Mode: Qwen CLI
```

### 未知模型警告
```
⚠️  No mapping found for model 'unknown-model', using default: claude-3-sonnet-20240229
```

### 模型映射表

| OpenAI 模型 | Claude 模型 |
|-------------|-------------|
| gpt-4 | claude-3-opus-20240229 |
| gpt-4-turbo | claude-3-haiku-20240307 |
| gpt-3.5-turbo | claude-3-sonnet-20240229 |
| gpt-4o | claude-3-5-sonnet-20241022 |
| gpt-4o-mini | claude-3-haiku-20240307 |
| 其他模型 | claude-3-sonnet-20240229 (默认) |

**注意**：使用 `--model` 参数可以覆盖所有映射，强制使用指定的模型。

## 高级模型映射

除了内置的模型映射外，你还支持通过 JSON 配置文件自定义模型映射规则，支持多种匹配模式和默认模型：

### 使用方法

#### 方法一：通过配置文件

1. 创建模型映射配置文件（参考 `model-mapping.example.json`）：

```json
{
  "mappings": [
    {
      "pattern": "claude-3-5",
      "target": "GLM-4",
      "type": "contains"
    },
    {
      "pattern": "gpt-4",
      "target": "claude-3-opus-20240229",
      "type": "contains"
    },
    {
      "pattern": "qwen-",
      "target": "qwen3-coder-plus",
      "type": "prefix"
    },
    {
      "pattern": "-turbo",
      "target": "claude-3-haiku-20240307",
      "type": "suffix"
    }
  ],
  "defaultModel": "claude-3-sonnet-20240229"
}
```

2. 启动服务时指定配置文件：

```bash
npm run dev -- --model-mapping ./model-mapping.json
```

#### 方法二：通过环境变量

```bash
# 设置环境变量
export MODEL_MAPPINGS='{"mappings":[{"pattern":"claude-3-5","target":"GLM-4","type":"contains"}]}'

# 启动服务
npm run dev
```

### 匹配模式说明

| 模式 | 说明 | 示例 |
|------|------|------|
| `contains` | 包含匹配（默认） | `"claude-3-5"` 匹配 `claude-3-5-sonnet`, `claude-3-5-haiku` |
| `exact` | 精确匹配 | `"gpt-4"` 只匹配 `gpt-4` |
| `prefix` | 前缀匹配 | `"qwen-"` 匹配 `qwen-7b`, `qwen-14b` |
| `suffix` | 后缀匹配 | `"-turbo"` 匹配 `gpt-4-turbo`, `gpt-3.5-turbo` |

### 默认模型

配置文件支持可选的 `defaultModel` 字段，当所有映射规则都不匹配时，会使用这个默认模型：

```json
{
  "mappings": [...],
  "defaultModel": "claude-3-sonnet-20240229"
}
```

**工作原理：**
1. 系统按顺序检查所有映射规则
2. 如果找到匹配，使用对应的 `target` 模型
3. 如果没有找到任何匹配，且配置了 `defaultModel`，则使用默认模型
4. 如果既没有匹配也没有默认模型，则返回原始模型名称

**使用场景：**
- 为未知模型提供一个合理的默认值
- 确保所有请求都能映射到有效的模型
- 简化配置，避免为每个可能的模型都创建映射规则

### 优先级

模型映射按照以下优先级顺序处理：

1. **model-mapping 模式匹配**（最高优先级）
   - JSON 配置文件中的模式匹配规则（按配置顺序）
   - 例如：`{"pattern": "claude-3-5", "target": "GLM-4", "type": "contains"}`

2. **model-mapping 默认模型**
   - JSON 配置文件中的 `defaultModel` 字段
   - 当所有模式匹配都不命中时使用

3. **`--model` 参数**
   - 命令行指定的模型参数
   - 相当于 model-mapping 中的外部默认模型
   - 仅在 model-mapping 配置中没有匹配且没有 defaultModel 时使用

4. **内置模型映射**（最低优先级）
   - 系统内置的模型映射表
   - 作为最后的备选方案

**示例：**
```bash
npm run dev -- --model-mapping ./config.json --model fallback-model
```

- 请求 `claude-3-5-sonnet` → 使用模式匹配映射到 `GLM-4`
- 请求 `unknown-model` → 使用配置文件中的 `defaultModel`
- 请求 `another-unknown`（配置文件无 defaultModel）→ 使用 `--model` 的 `fallback-model`

### 调试模式

设置环境变量 `DEBUG_MODEL_MAPPING=true` 可以在启动时显示所有激活的映射规则：

```bash
DEBUG_MODEL_MAPPING=true npm run dev -- --model-mapping ./model-mapping.json
```

### 环境变量支持

- `MODEL_MAPPING_FILE` - 模型映射配置文件路径
- `MODEL_MAPPINGS` - JSON 格式的模型映射配置
- `MODEL_MAPPING_ENV` - 存储模型映射配置的环境变量名（默认：`MODEL_MAPPINGS`）
- `DEBUG_MODEL_MAPPING` - 启用调试模式（`true`/`false`）

**通过环境变量配置默认模型：**

```bash
# 设置包含默认模型的映射配置
export MODEL_MAPPINGS='{"mappings":[{"pattern":"claude-3-5","target":"GLM-4","type":"contains"}],"defaultModel":"claude-3-sonnet-20240229"}'

# 启动服务
npm run dev
```

## 项目结构

```
src/
├── index.ts              # 主服务器文件
├── protocol-converter.ts # 协议转换逻辑
├── model-mapping.ts      # 高级模型映射管理器
└── qwen-cli-manager.ts   # Qwen CLI 认证管理器

model-mapping.example.json # 模型映射配置示例
test-mapping-logs.js      # 模型映射测试脚本
demo-model-mapping.sh     # 模型映射功能演示脚本
demo-default-model.sh     # 默认模型功能演示脚本
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

# 使用模型映射配置文件
npm run dev -- --model-mapping ./model-mapping.json

# 指定模型映射环境变量名
npm run dev -- --model-mapping-env CUSTOM_MODEL_MAPPINGS

# 启用调试模式查看映射规则
DEBUG_MODEL_MAPPING=true npm run dev -- --model-mapping ./model-mapping.json
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

## 实际应用场景

### 场景一：模型成本优化

通过模型映射，在不同场景使用最合适的模型：

```json
{
  "mappings": [
    {
      "pattern": "claude-3-haiku",
      "target": "gpt-3.5-turbo",
      "type": "exact"
    },
    {
      "pattern": "claude-3-opus",
      "target": "gpt-4",
      "type": "exact"
    }
  ]
}
```

### 场景二：多模型测试

在 AI 应用开发中，快速切换不同模型进行对比：

```bash
# 测试不同的后端模型
npm run dev -- --model gpt-4
npm run dev -- --model qwen-turbo
npm run dev -- --model claude-3-sonnet
```

### 场景三：企业级统一管理

对于企业用户，OpenAi2CC 可以作为 AI 服务的统一入口：

- 🏢 为不同团队提供统一的 API 接口
- 🔒 集中管理模型访问权限
- 📊 提供完整的请求日志和审计追踪

## 许可证

MIT