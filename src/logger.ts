// 日志级别
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// 日志条目接口
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
}

// 日志配置接口
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  format: 'json' | 'text';
  includeTimestamp: boolean;
}

// 默认配置
const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableFile: false,
  format: 'text',
  includeTimestamp: true
};

export class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
  }

  // 设置日志级别
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  // 调试日志
  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  // 信息日志
  info(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  // 警告日志
  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  // 错误日志
  error(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, metadata);
  }

  // 记录 API 请求
  logRequest(method: string, url: string, headers?: Record<string, any>, body?: any): void {
    this.debug(`API Request: ${method} ${url}`, 'API', {
      method,
      url,
      headers: this.sanitizeHeaders(headers),
      body: body ? this.sanitizeBody(body) : undefined
    });
  }

  // 记录 API 响应
  logResponse(statusCode: number, duration: number, response?: any): void {
    this.debug(`API Response: ${statusCode} (${duration}ms)`, 'API', {
      statusCode,
      duration,
      response: response ? this.sanitizeResponse(response) : undefined
    });
  }

  // 记录重试
  logRetry(attempt: number, maxRetries: number, error: any, delay: number): void {
    this.warn(
      `Retry attempt ${attempt}/${maxRetries} after ${delay}ms`,
      'Retry',
      {
        attempt,
        maxRetries,
        delay,
        error: error.message,
        statusCode: error.response?.status
      }
    );
  }

  // 记录错误详情
  logErrorDetails(error: any, context?: string): void {
    this.error(
      `Error in ${context || 'unknown'}: ${error.message}`,
      context,
      {
        stack: error.stack,
        code: error.code,
        statusCode: error.response?.status,
        response: error.response?.data
      }
    );
  }

  // 获取日志缓冲区
  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logBuffer.filter(log => log.level >= level);
    }
    return [...this.logBuffer];
  }

  // 清空日志缓冲区
  clearLogs(): void {
    this.logBuffer = [];
  }

  // 导出日志
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logBuffer, null, 2);
    } else if (format === 'csv') {
      const headers = ['timestamp', 'level', 'message', 'context', 'metadata'];
      const rows = this.logBuffer.map(log => [
        log.timestamp,
        LogLevel[log.level],
        log.message,
        log.context || '',
        JSON.stringify(log.metadata || {})
      ]);
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    return '';
  }

  // 私有方法：记录日志
  private log(level: LogLevel, message: string, context?: string, metadata?: Record<string, any>): void {
    // 检查日志级别
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata
    };

    // 添加到缓冲区
    this.logBuffer.push(entry);
    
    // 限制缓冲区大小
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }

    // 输出到控制台
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // 输出到文件
    if (this.config.enableFile && this.config.filePath) {
      this.logToFile(entry);
    }
  }

  // 私有方法：输出到控制台
  private logToConsole(entry: LogEntry): void {
    const { timestamp, level, message, context, metadata } = entry;
    
    let logMessage = '';
    
    if (this.config.includeTimestamp) {
      logMessage += `[${timestamp}] `;
    }
    
    const levelStr = LogLevel[level].padEnd(5);
    logMessage += `${levelStr}: ${message}`;
    
    if (context) {
      logMessage += ` [${context}]`;
    }
    
    if (metadata && Object.keys(metadata).length > 0) {
      logMessage += ` ${JSON.stringify(metadata)}`;
    }
    
    // 根据级别选择输出方式
    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.DEBUG:
        if (this.config.level === LogLevel.DEBUG) {
          console.log(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }

  // 私有方法：输出到文件
  private async logToFile(entry: LogEntry): Promise<void> {
    if (!this.config.filePath) return;
    
    try {
      const fs = await import('fs');
      const line = this.formatLogEntry(entry);
      
      await fs.promises.appendFile(this.config.filePath, line + '\n');
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  // 私有方法：格式化日志条目
  private formatLogEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    } else {
      const { timestamp, level, message, context, metadata } = entry;
      let line = '';
      
      if (this.config.includeTimestamp) {
        line += `[${timestamp}] `;
      }
      
      line += `${LogLevel[level]}: ${message}`;
      
      if (context) {
        line += ` [${context}]`;
      }
      
      if (metadata && Object.keys(metadata).length > 0) {
        line += ` ${JSON.stringify(metadata)}`;
      }
      
      return line;
    }
  }

  // 私有方法：清理敏感信息
  private sanitizeHeaders(headers?: Record<string, any>): Record<string, any> {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'cookie', 'set-cookie'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  // 私有方法：清理请求体
  private sanitizeBody(body: any): any {
    if (typeof body !== 'object' || body === null) return body;
    
    const sanitized = Array.isArray(body) ? [...body] : { ...body };
    const sensitiveKeys = ['password', 'token', 'api_key', 'secret'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeBody(sanitized[key]);
      }
    }
    
    return sanitized;
  }

  // 私有方法：清理响应
  private sanitizeResponse(response: any): any {
    if (!response) return response;
    
    // 清理响应中的敏感信息
    if (response.headers) {
      response.headers = this.sanitizeHeaders(response.headers);
    }
    
    return response;
  }
}

// 创建全局日志实例
export const logger = new Logger({
  level: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  format: 'text'
});