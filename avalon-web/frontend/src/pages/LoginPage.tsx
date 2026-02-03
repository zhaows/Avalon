/**
 * Login Page - Standalone login/register page.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

type LoginMethod = 'password' | 'phone' | 'wechat';
type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, login } = useAuthStore();
  
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

  // 获取重定向URL
  const from = (location.state as any)?.from || '/';

  // 如果已登录，跳转回原页面
  useEffect(() => {
    if (isLoggedIn) {
      navigate(from, { replace: true });
    }
  }, [isLoggedIn, navigate, from]);

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
      } else {
        const response = await authApi.login(username.trim(), password);
        login(response.token, response.user);
        toast.success('登录成功');
      }
      // 登录成功后会自动跳转（通过 useEffect）
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
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // 微信登录
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* 装饰元素 */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl"></div>
      
      {/* Logo */}
      <div className="text-center mb-8 fade-in">
        <div className="text-6xl mb-4 animate-float">⚔️</div>
        <h1 className="text-4xl font-bold">
          <span className="gradient-text">阿瓦隆</span>
        </h1>
        <p className="text-slate-400 mt-2">经典7人阵营推理桌游</p>
      </div>

      {/* 登录表单 */}
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-6 w-full max-w-md shadow-2xl fade-in" style={{ animationDelay: '0.1s' }}>
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
            微信登录
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 新用户提示 */}
        {mode === 'register' && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-2 rounded-lg mb-4 text-sm text-center">
            🎁 新用户注册赠送 20 人次 AI 玩家额度
          </div>
        )}

        {/* 账号密码表单 */}
        {method === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg 
                             text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
            >
              {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
            </button>
          </form>
        )}

        {/* 手机验证码表单 */}
        {method === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                maxLength={11}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg 
                           text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6位验证码"
                  maxLength={6}
                  className="flex-1 px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg 
                             text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSendSMS}
                  disabled={countdown > 0 || smsSending}
                  className="px-4 py-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 
                             disabled:text-gray-500 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  {countdown > 0 ? `${countdown}秒` : (smsSending ? '发送中' : '发送验证码')}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
            >
              {loading ? '登录中...' : '登录/注册'}
            </button>
          </form>
        )}

        {/* 微信登录 */}
        {method === 'wechat' && (
          <div className="text-center">
            <button
              onClick={handleWeChatLogin}
              disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
            >
              {loading ? '跳转中...' : '💬 微信一键登录'}
            </button>
            <p className="text-gray-400 text-sm mt-3">
              点击后将跳转到微信授权页面
            </p>
          </div>
        )}

        {/* 切换登录/注册 */}
        {method === 'password' && (
          <div className="text-center mt-4">
            <button
              onClick={switchMode}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {mode === 'login' ? '没有账号？点击注册' : '已有账号？点击登录'}
            </button>
          </div>
        )}

        {/* 返回首页 */}
        <div className="text-center mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← 返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
