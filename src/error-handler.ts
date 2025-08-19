// 错误处理工具
import { logger } from './logger';

export interface ProxyError {
  message: string;
  type: string;
  code: number;
  param?: string;
  original_code?: string;
}

export class ErrorHandler {
  // 从错误中提取友好的错误信息
  static extractErrorMessage(error: any): string {
    // 如果是 Axios 错误，尝试从响应中获取错误信息
    if (error.response?.data?.error?.message) {
      return error.response.data.error.message;
    }
    
    // 如果是网络错误
    if (error.code === 'ECONNREFUSED') {
      return 'Connection refused: Unable to connect to the upstream service';
    }
    
    if (error.code === 'ETIMEDOUT') {
      return 'Connection timeout: The upstream service did not respond in time';
    }
    
    // 默认返回原始错误消息
    return error.message || 'Unknown error occurred';
  }

  // 获取错误类型
  static getErrorType(statusCode: number, error: any): string {
    if (error.response?.data?.error?.type) {
      return error.response.data.error.type;
    }
    
    switch (statusCode) {
      case 503: return 'service_unavailable';
      case 502: return 'bad_gateway';
      case 504: return 'gateway_timeout';
      case 429: return 'rate_limit_error';
      case 401: return 'authentication_error';
      case 403: return 'permission_error';
      case 404: return 'not_found';
      case 400: return 'invalid_request_error';
      default: return 'api_error';
    }
  }

  // 创建标准化的错误响应
  static createErrorResponse(error: any, statusCode: number = 500): ProxyError {
    const message = this.extractErrorMessage(error);
    const type = this.getErrorType(statusCode, error);
    
    return {
      message: this.enhanceErrorMessage(message, type),
      type,
      code: statusCode,
      ...(error.response?.data?.error?.param && { param: error.response.data.error.param }),
      ...(error.code && { original_code: error.code })
    };
  }

  // 增强错误消息，添加更多上下文
  private static enhanceErrorMessage(message: string, type: string): string {
    switch (type) {
      case 'service_unavailable':
        return `Service unavailable: ${message}. The upstream service may be temporarily down or overloaded. Please try again later.`;
      case 'bad_gateway':
        return `Bad gateway: ${message}. The upstream service returned an invalid response.`;
      case 'gateway_timeout':
        return `Gateway timeout: ${message}. The upstream service took too long to respond.`;
      case 'rate_limit_error':
        return `Rate limit exceeded: ${message}. Please slow down your requests.`;
      case 'authentication_error':
        return `Authentication failed: ${message}. Please check your API key.`;
      case 'permission_error':
        return `Access denied: ${message}. You may not have permission to access this resource.`;
      case 'not_found':
        return `Resource not found: ${message}. The requested endpoint or model may not exist.`;
      default:
        return message;
    }
  }

  // 判断是否应该重试
  static shouldRetry(statusCode: number, error: any): boolean {
    // 临时性错误状态码
    const retryableStatusCodes = [502, 503, 504, 429];
    
    // 网络错误也应该重试
    const retryableErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    
    return retryableStatusCodes.includes(statusCode) || 
           retryableErrorCodes.includes(error.code);
  }

  // 记录错误日志
  static logError(error: any, context: string = ''): void {
    const statusCode = error.response?.status || 'N/A';
    const errorMessage = this.extractErrorMessage(error);
    const errorType = this.getErrorType(statusCode, error);
    
    logger.logErrorDetails(error, context);
    
    // 同时记录结构化错误信息
    logger.error(errorMessage, context, {
      statusCode,
      errorType,
      code: error.code,
      response: error.response?.data
    });
  }
}