// 重试配置接口
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean; // 是否添加随机抖动
}

import { logger } from './logger';

// 重试策略类型
export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

// 重试条件接口
export interface RetryCondition {
  statusCode?: number[];
  errorCodes?: string[];
  customCondition?: (error: any, attempt: number) => boolean;
}

// 默认重试配置
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true
};

// 默认重试条件
export const DEFAULT_RETRY_CONDITION: RetryCondition = {
  statusCode: [502, 503, 504, 429],
  errorCodes: ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']
};

export class RetryManager {
  private config: RetryConfig;
  private condition: RetryCondition;
  private strategy: RetryStrategy;

  constructor(
    config: Partial<RetryConfig> = {},
    condition: Partial<RetryCondition> = {},
    strategy: RetryStrategy = 'exponential'
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.condition = { ...DEFAULT_RETRY_CONDITION, ...condition };
    this.strategy = strategy;
  }

  // 计算延迟时间
  calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.strategy) {
      case 'exponential':
        delay = this.config.initialDelay * Math.pow(this.config.backoffFactor, attempt - 1);
        break;
      case 'linear':
        delay = this.config.initialDelay + (this.config.initialDelay * (attempt - 1));
        break;
      case 'fixed':
        delay = this.config.initialDelay;
        break;
      default:
        delay = this.config.initialDelay * Math.pow(this.config.backoffFactor, attempt - 1);
    }

    // 应用最大延迟限制
    delay = Math.min(delay, this.config.maxDelay);

    // 添加随机抖动（避免多个客户端同时重试）
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  // 判断是否应该重试
  shouldRetry(error: any, attempt: number): boolean {
    // 如果达到最大重试次数，不再重试
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    const statusCode = error.response?.status;
    const errorCode = error.code;

    // 检查状态码
    if (statusCode && this.condition.statusCode?.includes(statusCode)) {
      return true;
    }

    // 检查错误码
    if (errorCode && this.condition.errorCodes?.includes(errorCode)) {
      return true;
    }

    // 检查自定义条件
    if (this.condition.customCondition) {
      return this.condition.customCondition(error, attempt);
    }

    return false;
  }

  // 执行带重试的操作
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        
        // 记录重试信息
        logger.logRetry(attempt, this.config.maxRetries, error, delay);

        // 等待后重试
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  // 延迟函数
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取配置信息
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  // 更新配置
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}