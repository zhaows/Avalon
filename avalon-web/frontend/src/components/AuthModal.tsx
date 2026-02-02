/**
 * Authentication Modal - Login and Register dialog.
 * Supports: Username/Password, Phone SMS, WeChat
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

type LoginMethod = 'password' | 'phone' | 'wechat';
type AuthMode = 'login' | 'register';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<LoginMethod>('password');
  
  // 用户名密码登录
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 手机号登录
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [smsSending, setSmsSending] = useState(false);
  
  // 通用状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuthStore();

  // 短信验证码倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 发送短信验证码
  const handleSendSMS = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    
    setSmsSending(true);
    setError('');
    
    try {
      await authApi.sendSMS(phone);
      toast.success('验证码已发送');
      setCountdown(60);
    } catch (err: any) {
      setError(err.message || '发送失败');
    } finally {
      setSmsSending(false);
    }
  };

  // 用户名密码登录/注册
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password) {
      setError('请填写用户名和密码');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        const response = await authApi.register(username.trim(), password);
        login(response.token, response.user);
        toast.success(response.message);
        onClose();
      } else {
        const response = await authApi.login(username.trim(), password);
        login(response.token, response.user);
        toast.success('登录成功');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 手机号验证码登录
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    
    if (!smsCode || smsCode.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.phoneLogin(phone, smsCode);
      login(response.token, response.user);
      toast.success(response.message);
      onClose();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 微信登录（跳转到微信授权页）
  const handleWeChatLogin = async () => {
    setLoading(true);
    try {
      const { oauth_url } = await authApi.getWeChatQRCode(window.location.href);
      window.location.href = oauth_url;
    } catch (err: any) {
      setError(err.message || '获取微信登录链接失败');
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setPhone('');
    setSmsCode('');
    setError('');
  };

  if (!isOpen) return null;

  // 使用 Portal 渲染到 body，避免被父元素遮挡
  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl relative">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
        >
          ×
        </button>

        {/* 标题 */}
        <h2 className="text-2xl font-bold text-center mb-4">
          {mode === 'login' ? '🔐 登录' : '📝 注册'}
        </h2>

        {/* 登录方式切换 */}
        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={() => { setMethod('password'); resetForm(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === 'password'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            账号密码
          </button>
          <button
            disabled
            title="即将开放"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
          >
            手机验证码
          </button>
          <button
            disabled
            title="即将开放"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-500 cursor-not-allowed opacity-50"
          >
            微信
          </button>
        </div>

        {/* 用户名密码表单 */}
        {method === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                           focus:ring-blue-500"
                placeholder="请输入用户名"
                maxLength={20}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                           focus:ring-blue-500"
                placeholder="请输入密码"
                disabled={loading}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                             text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                             focus:ring-blue-500"
                  placeholder="请再次输入密码"
                  disabled={loading}
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {mode === 'register' && (
              <p className="text-green-400 text-sm text-center">
                🎁 新用户注册赠送 20 人次 AI 玩家额度！
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
            >
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={switchMode}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                {mode === 'login' ? '没有账号？点击注册' : '已有账号？点击登录'}
              </button>
            </div>
          </form>
        )}

        {/* 手机号验证码表单 */}
        {method === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                手机号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                           focus:ring-blue-500"
                placeholder="请输入手机号"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                验证码
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg 
                             text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                             focus:ring-blue-500"
                  placeholder="请输入6位验证码"
                  maxLength={6}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleSendSMS}
                  disabled={smsSending || countdown > 0 || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                             text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  {smsSending ? '发送中...' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <p className="text-green-400 text-sm text-center">
              🎁 新手机号自动注册，赠送 20 人次 AI 玩家额度！
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
            >
              {loading ? '处理中...' : '登录 / 注册'}
            </button>
          </form>
        )}

        {/* 微信登录 */}
        {method === 'wechat' && (
          <div className="space-y-4 text-center">
            <div className="py-8">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-gray-300 mb-4">
                点击下方按钮，跳转微信授权登录
              </p>
              <p className="text-green-400 text-sm">
                🎁 新用户自动注册，赠送 20 人次 AI 玩家额度！
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              onClick={handleWeChatLogin}
              disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                '跳转中...'
              ) : (
                <>
                  <span>💬</span> 微信登录
                </>
              )}
            </button>

            <p className="text-gray-500 text-xs">
              注：微信登录需要在服务端配置微信开放平台参数
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
