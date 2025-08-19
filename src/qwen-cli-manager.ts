import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

export interface OAuthCreds {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type?: string;
  resource_url?: string;
}

export class QwenCLIManager {
  private oauthCreds: OAuthCreds | null = null;
  private readonly OAUTH_FILE: string;
  private readonly CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.OAUTH_FILE = path.join(os.homedir(), '.qwen', 'oauth_creds.json');
  }

  async initialize(): Promise<void> {
    await this.loadOAuthCreds();
    this.startTokenRefreshTimer();
  }

  private async loadOAuthCreds(): Promise<void> {
    try {
      const data = await fs.readFile(this.OAUTH_FILE, 'utf-8');
      this.oauthCreds = JSON.parse(data);
      console.log('✅ Qwen CLI OAuth credentials loaded');
    } catch (error) {
      console.warn('⚠️  No Qwen CLI OAuth credentials found');
      this.oauthCreds = null;
    }
  }

  private async saveOAuthCreds(creds: OAuthCreds): Promise<void> {
    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(this.OAUTH_FILE), { recursive: true });
      await fs.writeFile(this.OAUTH_FILE, JSON.stringify(creds, null, 2));
      console.log('💾 OAuth credentials saved');
    } catch (error) {
      console.error('❌ Failed to save OAuth credentials:', error);
    }
  }

  async refreshToken(): Promise<void> {
    if (!this.oauthCreds?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      console.log('🔄 Refreshing Qwen CLI token...');
      
      const urlencoded = new URLSearchParams();
      urlencoded.append('client_id', this.CLIENT_ID);
      urlencoded.append('refresh_token', this.oauthCreds.refresh_token);
      urlencoded.append('grant_type', 'refresh_token');

      const response = await axios.post(
        'https://chat.qwen.ai/api/v1/oauth2/token',
        urlencoded.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const data = response.data;
      this.oauthCreds = {
        access_token: data.access_token,
        refresh_token: this.oauthCreds.refresh_token, // 保留原有的 refresh_token
        expiry_date: Date.now() + data.expires_in * 1000 - 1000 * 60, // 提前1分钟过期
        token_type: data.token_type,
      };

      await this.saveOAuthCreds(this.oauthCreds);
      console.log('✅ Token refreshed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
      throw error;
    }
  }

  private startTokenRefreshTimer(): void {
    if (!this.oauthCreds) return;

    // 计算下次刷新时间（过期前5分钟）
    const timeUntilExpiry = this.oauthCreds.expiry_date - Date.now() - 5 * 60 * 1000;
    
    if (timeUntilExpiry > 0) {
      console.log(`⏰ Next token refresh in ${Math.floor(timeUntilExpiry / 1000 / 60)} minutes`);
      
      this.refreshTimer = setTimeout(async () => {
        try {
          await this.refreshToken();
          // 刷新成功后，设置下一次定时器
          this.startTokenRefreshTimer();
        } catch (error) {
          console.error('❌ Auto refresh failed, retrying in 1 minute...');
          // 1分钟后重试
          setTimeout(() => this.startTokenRefreshTimer(), 60 * 1000);
        }
      }, timeUntilExpiry);
    } else {
      // 如果已经过期或即将过期，立即刷新
      this.refreshToken().catch(() => {
        // 如果刷新失败，1分钟后重试
        setTimeout(() => this.startTokenRefreshTimer(), 60 * 1000);
      });
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.oauthCreds) {
      return null;
    }

    // 检查是否过期
    if (this.oauthCreds.expiry_date < Date.now()) {
      try {
        await this.refreshToken();
      } catch (error) {
        console.error('❌ Failed to refresh expired token');
        return null;
      }
    }

    return this.oauthCreds.access_token;
  }

  isConfigured(): boolean {
    return this.oauthCreds !== null;
  }

  getResourceUrl(): string | null {
    const baseUrl = this.oauthCreds?.resource_url;
    if (!baseUrl) {
      return null;
    }
    
    // 如果 URL 没有协议，添加 https://
    let fullUrl = baseUrl;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      fullUrl = `https://${baseUrl}`;
    }
    
    // 确保以 /v1 结尾
    if (!fullUrl.endsWith('/v1')) {
      fullUrl = `${fullUrl}/v1`;
    }
    
    return fullUrl;
  }

  cleanup(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// 单例实例
export const qwenCLIManager = new QwenCLIManager();