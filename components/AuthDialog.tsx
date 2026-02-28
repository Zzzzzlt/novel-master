import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { authService, AuthUser } from '../services/auth';
import { LogIn, LogOut, User, Shield, ShieldOff, Loader2 } from 'lucide-react';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // 订阅用户状态变化
    const unsubscribe = authService.subscribe((u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 直接打开 Netlify Identity 登录框
    try {
      // 优先使用全局对象
      const netlifyIdentity = (window as any).netlifyIdentity;
      if (netlifyIdentity) {
        netlifyIdentity.open();
        onClose();
        setLoading(false);
        return;
      }

      // 备选：使用 authService
      authService.openLogin();
      onClose();
    } catch (err) {
      console.error('Login error:', err);
      setError('登录失败，请重试');
    }

    setLoading(false);
  };

  const handleLogout = () => {
    authService.logout();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-background rounded-lg shadow-xl border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">账户登录</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {user ? (
          // 已登录状态
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <div className="flex items-center gap-1 mt-1">
                  {user.role === 'admin' ? (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Shield className="w-3 h-3" /> 管理员
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ShieldOff className="w-3 h-3" /> 普通用户
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </div>
        ) : (
          // 未登录状态
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">账号</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="请输入手机号或邮箱"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              登录
            </button>
          </form>
        )}
      </div>
    </div>
  , document.body);
};

// 用户状态显示组件
export const AuthButton: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ remaining: number; isAdmin: boolean }>({ remaining: 0, isAdmin: false });

  useEffect(() => {
    const unsubscribe = authService.subscribe((u) => {
      setUser(u);
      // 更新使用次数信息
      if (u) {
        setUsageInfo({
          remaining: authService.getRemainingBodyUsage(),
          isAdmin: u.role === 'admin'
        });
      }
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="flex flex-col items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors w-full"
        title={user ? `${user.username} (${user.role})` : '登录'}
      >
        {user ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                {user.role === 'admin' ? (
                  <Shield className="w-3 h-3 text-primary" />
                ) : (
                  <User className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
              <span>{user.username}</span>
            </div>
            {/* 显示剩余次数 */}
            {!usageInfo.isAdmin && (
              <span className="text-[10px] text-muted-foreground">
                今日剩余：{usageInfo.remaining} 次
              </span>
            )}
          </>
        ) : (
          <>
            <User className="w-4 h-4" />
            <span>登录</span>
          </>
        )}
      </button>

      <AuthDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
      />
    </>
  );
};
