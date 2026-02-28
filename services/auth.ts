/**
 * Auth Service - Netlify Identity 认证服务
 *
 * 注意：Netlify Identity 已于 2025年2月28日被正式废弃
 * 本服务提供 Netlify Identity 的初始化（占位），同时提供本地存储后备方案用于本地测试
 *
 * 部署到 Netlify 后：
 * 1. 在 Netlify 控制台启用 Identity 服务
 * 2. 配置用户角色（admin 和普通用户）
 * 3. 替换 NETLIFY_IDENTITY_URL 为你的 Netlify 站点 URL
 */

import netlifyIdentity from 'netlify-identity-widget';

// Netlify Identity 配置
// 部署到 Netlify 后，替换为你的站点 URL（如：https://your-site.netlify.app）
const NETLIFY_IDENTITY_URL = 'https://novel-master.netlify.app';

// 用户角色类型
export type UserRole = 'admin' | 'user';

// 用户信息接口
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  metadata?: {
    full_name?: string;
  };
}

// 预定义用户账号（仅用于本地开发测试）
// 部署到 Netlify 后，应通过环境变量配置或使用 Netlify Identity
// 本地开发时从环境变量读取，否则使用空配置（无法登录）
const localAdminUser = import.meta.env.VITE_ADMIN_USER || '';
const localAdminPass = import.meta.env.VITE_ADMIN_PASS || '';
const localNormalUser = import.meta.env.VITE_NORMAL_USER || '';
const localNormalPass = import.meta.env.VITE_NORMAL_PASS || '';

// 管理员邮箱列表（从环境变量读取，逗号分隔）
const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(e => e);

export const TEST_USERS: Record<string, { password: string; username: string; role: UserRole }> = localAdminUser && localAdminPass ? {
  [localAdminUser]: {
    password: localAdminPass,
    username: import.meta.env.VITE_ADMIN_NAME || 'ZZZ',
    role: 'admin' as UserRole
  },
  ...(localNormalUser && localNormalPass ? {
    [localNormalUser]: {
      password: localNormalPass,
      username: import.meta.env.VITE_NORMAL_NAME || 'User0',
      role: 'user' as UserRole
    }
  } : {})
} : {};

// Auth Service 类
class AuthService {
  private currentUser: AuthUser | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();
  private isInitialized = false;

  // 初始化 Netlify Identity
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 配置 Netlify Identity
      netlifyIdentity.init({
        APIUrl: NETLIFY_IDENTITY_URL,
        logo: false,
        language: 'zh-CN'
      });

      // 监听登录事件
      netlifyIdentity.on('login', (user) => {
        if (user) {
          this.handleNetlifyLogin(user);
        }
      });

      // 监听登出事件
      netlifyIdentity.on('logout', () => {
        this.handleLogout();
      });

      // 检查当前是否已登录
      const currentUser = netlifyIdentity.currentUser();
      if (currentUser) {
        this.handleNetlifyLogin(currentUser);
      }

      this.isInitialized = true;
      console.log('[Auth] Netlify Identity initialized');
    } catch (error) {
      console.warn('[Auth] Netlify Identity init failed, using local fallback:', error);
      // 使用本地存储后备方案
      this.loadFromLocalStorage();
      this.isInitialized = true;
    }
  }

  // 处理 Netlify 登录
  private handleNetlifyLogin(user: any): void {
    // 从用户元数据或 app_metadata 获取角色
    // Netlify Identity 角色可能在 user_metadata.role 或 app_metadata.role
    let roleStr = user.user_metadata?.role || user.app_metadata?.role || 'user';

    // 如果环境变量中配置了管理员邮箱，则该邮箱自动获得管理员权限
    const userEmail = (user.email || '').toLowerCase();
    if (adminEmails.includes(userEmail)) {
      roleStr = 'admin';
    }

    const role: UserRole = roleStr === 'admin' ? 'admin' : 'user';

    console.log('[Auth] Netlify user metadata:', user.user_metadata);
    console.log('[Auth] Netlify app metadata:', user.app_metadata);
    console.log('[Auth] Admin emails configured:', adminEmails);
    console.log('[Auth] User email:', userEmail);
    console.log('[Auth] Detected role:', role);

    this.currentUser = {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.full_name || user.email.split('@')[0],
      role,
      metadata: user.user_metadata
    };

    this.notifyListeners();
    console.log('[Auth] Netlify login:', this.currentUser);
  }

  // 登录（使用本地后备方案）
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    // 先尝试 Netlify Identity 登录
    try {
      if (netlifyIdentity.currentUser()) {
        netlifyIdentity.logout();
      }
      await netlifyIdentity.open();
      return { success: true };
    } catch (error) {
      console.warn('[Auth] Netlify login failed, trying local fallback');
    }

    // 本地后备方案：使用预定义用户账号
    const userConfig = TEST_USERS[email];
    if (!userConfig) {
      return { success: false, error: '用户不存在' };
    }

    if (userConfig.password !== password) {
      return { success: false, error: '密码错误' };
    }

    // 登录成功
    this.currentUser = {
      id: `local_${Date.now()}`,
      email,
      username: userConfig.username,
      role: userConfig.role
    };

    // 保存到本地存储
    this.saveToLocalStorage();
    this.notifyListeners();

    return { success: true };
  }

  // 登出
  logout(): void {
    // 尝试 Netlify Identity 登出
    try {
      const currentUser = netlifyIdentity.currentUser();
      if (currentUser) {
        netlifyIdentity.logout();
        return;
      }
    } catch (error) {
      console.warn('[Auth] Netlify logout failed');
    }

    // 本地后备方案
    this.handleLogout();
  }

  // 处理登出
  private handleLogout(): void {
    this.currentUser = null;
    localStorage.removeItem('novel_master_user');
    this.notifyListeners();
    console.log('[Auth] Logged out');
  }

  // 获取当前用户
  getUser(): AuthUser | null {
    return this.currentUser;
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  // 检查是否是管理员
  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  // 检查是否有开发者模式权限
  hasDevMode(): boolean {
    return this.currentUser?.role === 'admin';
  }

  // 检查是否能显示推理内容
  canShowReasoning(): boolean {
    // 管理员可以显示推理内容
    if (this.currentUser?.role === 'admin') {
      return true;
    }
    // 普通用户不能显示推理内容
    return false;
  }

  // 监听用户变化
  subscribe(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    // 立即调用一次以获取当前状态
    listener(this.currentUser);
    return () => this.listeners.delete(listener);
  }

  // 通知所有监听器
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentUser));
  }

  // 从本地存储加载用户
  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem('novel_master_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[Auth] Failed to load from localStorage:', error);
    }
  }

  // 保存到本地存储
  private saveToLocalStorage(): void {
    try {
      if (this.currentUser) {
        localStorage.setItem('novel_master_user', JSON.stringify(this.currentUser));
      }
    } catch (error) {
      console.error('[Auth] Failed to save to localStorage:', error);
    }
  }

  // ============================================
  // 普通用户使用限制功能
  // ============================================

  // 普通用户每日限制次数
  private readonly DAILY_BODY_LIMIT = 30;
  private readonly USAGE_STORAGE_KEY = 'novel_master_body_usage';

  // 获取今天的日期字符串（YYYY-MM-DD）
  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  // 获取今日使用次数
  getTodayBodyUsage(): number {
    if (this.isAdmin()) {
      return 0; // 管理员无限制
    }

    try {
      const usageData = localStorage.getItem(this.USAGE_STORAGE_KEY);
      if (!usageData) return 0;

      const data = JSON.parse(usageData);
      const today = this.getTodayKey();

      if (data.date === today) {
        return data.count || 0;
      }
    } catch (error) {
      console.error('[Auth] Failed to get usage:', error);
    }
    return 0;
  }

  // 获取剩余次数
  getRemainingBodyUsage(): number {
    if (this.isAdmin()) {
      return -1; // -1 表示无限制
    }
    return Math.max(0, this.DAILY_BODY_LIMIT - this.getTodayBodyUsage());
  }

  // 检查是否能使用 Body 模式
  canUseBodyMode(): { allowed: boolean; remaining?: number; error?: string } {
    // 管理员无限制
    if (this.isAdmin()) {
      return { allowed: true };
    }

    const remaining = this.getRemainingBodyUsage();
    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        error: '今日使用次数已用完（普通用户每天30次）'
      };
    }

    return { allowed: true, remaining };
  }

  // 增加 Body 模式使用次数
  incrementBodyUsage(): void {
    if (this.isAdmin()) {
      return; // 管理员不计数
    }

    try {
      const today = this.getTodayKey();
      const usageData = localStorage.getItem(this.USAGE_STORAGE_KEY);
      let data = { date: today, count: 0 };

      if (usageData) {
        const parsed = JSON.parse(usageData);
        if (parsed.date === today) {
          data = parsed;
        }
      }

      data.count = (data.count || 0) + 1;
      localStorage.setItem(this.USAGE_STORAGE_KEY, JSON.stringify(data));

      console.log(`[Auth] Body mode usage: ${data.count}/${this.DAILY_BODY_LIMIT}`);
    } catch (error) {
      console.error('[Auth] Failed to increment usage:', error);
    }
  }

  // 打开登录对话框
  openLogin(): void {
    try {
      // 尝试使用导入的模块
      if (netlifyIdentity) {
        netlifyIdentity.open();
        return;
      }
    } catch (error) {
      console.warn('[Auth] Module import failed, trying window');
    }

    // 尝试使用全局对象（index.html 已加载脚本）
    try {
      const netlifyIdentityWindow = (window as any).netlifyIdentity;
      if (netlifyIdentityWindow) {
        netlifyIdentityWindow.open();
        return;
      }
    } catch (error) {
      console.error('[Auth] Window method failed:', error);
    }

    console.error('[Auth] Unable to open Netlify Identity login');
  }
}

// 导出单例
export const authService = new AuthService();
