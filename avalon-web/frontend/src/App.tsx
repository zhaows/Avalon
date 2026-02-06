import { useEffect, Component, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RoomPage from './pages/RoomPage'
import GamePage from './pages/GamePage'
import ToastContainer from './components/ToastContainer'
import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute'
import { trackPageView } from './utils/analytics'
import { setOnAuthExpired, authApi } from './api'
import { useAuthStore } from './store/authStore'
import { useToastStore } from './store/toastStore'

// 错误边界组件 - 防止整个应用因未捕获错误而白屏
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-red-400 mb-4">页面出错了</h1>
            <p className="text-slate-400 mb-4">{this.state.error?.message}</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Analytics tracker component
function AnalyticsTracker() {
  const location = useLocation();
  
  useEffect(() => {
    // Track page view on route change
    trackPageView(location.pathname);
  }, [location.pathname]);
  
  return null;
}

// 应用启动时验证 token 有效性
function AuthValidator() {
  const { isLoggedIn, token, logout, login, _hasHydrated } = useAuthStore();
  const setAuthChecked = useAuthStore(state => state.setAuthChecked);

  useEffect(() => {
    // 等待 hydration 完成后再验证
    if (!_hasHydrated) return;
    
    // 如果本地没有登录状态，直接标记验证完成
    if (!isLoggedIn || !token) {
      setAuthChecked(true);
      return;
    }
    
    // 验证 token 是否有效
    authApi.getUserInfo(token)
      .then((response) => {
        // token 有效，更新用户信息（login 内部会设置 _authChecked: true）
        if (response.user) {
          login(token, response.user);
        } else {
          setAuthChecked(true);
        }
      })
      .catch(() => {
        // token 无效时，401 会由 onAuthExpired 回调处理 logout（内部设置 _authChecked: true）
        // 这里仅做静默兜底（处理非401的网络错误等情况）
        setTimeout(() => {
          const { isLoggedIn: stillLoggedIn } = useAuthStore.getState();
          if (stillLoggedIn) {
            logout();
          }
        }, 200);
      });
  }, [_hasHydrated]); // 依赖 _hasHydrated，hydration 完成后执行

  return null;
}

// 设置全局登录失效处理
function AuthExpiredHandler() {
  const logout = useAuthStore(state => state.logout);
  const addToast = useToastStore(state => state.addToast);
  
  useEffect(() => {
    let hasExpired = false;  // 防止重复触发
    setOnAuthExpired((reason?: string) => {
      if (hasExpired) return;  // 已处理过，忽略后续调用
      hasExpired = true;
      logout();
      const title = reason || '登录已过期，请重新登录';
      addToast({ type: 'warning', title });
      // 5秒后重置，允许新的过期检测（如重新登录后再次过期）
      setTimeout(() => { hasExpired = false; }, 5000);
    });
  }, [logout, addToast]);
  
  return null;
}

// 多窗口状态同步：监听其他窗口的 localStorage 变化
function CrossTabSync() {
  const { login, logout, isLoggedIn, token } = useAuthStore();
  const addToast = useToastStore(state => state.addToast);
  
  useEffect(() => {
    const STORAGE_KEY = 'avalon-auth-storage';
    
    const handleStorageChange = (event: StorageEvent) => {
      // 只处理我们关心的 key
      if (event.key !== STORAGE_KEY) return;
      
      // 获取新值
      const newValue = event.newValue;
      
      if (!newValue) {
        // localStorage 被清空 - 其他窗口登出了
        if (isLoggedIn) {
          logout();
          addToast({ type: 'info', title: '您已在其他窗口登出' });
        }
        return;
      }
      
      try {
        const parsed = JSON.parse(newValue);
        const state = parsed.state;
        
        if (!state) return;
        
        // 其他窗口登出了
        if (!state.isLoggedIn && isLoggedIn) {
          logout();
          addToast({ type: 'info', title: '您已在其他窗口登出' });
        }
        // 其他窗口登录了（或切换了账号）
        else if (state.isLoggedIn && state.token && state.token !== token) {
          login(state.token, state.user);
          addToast({ type: 'info', title: '登录状态已同步' });
        }
      } catch (e) {
        console.error('Failed to parse storage event:', e);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isLoggedIn, token, login, logout, addToast]);
  
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen">
          <AnalyticsTracker />
          <AuthExpiredHandler />
          <AuthValidator />
          <CrossTabSync />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            } />
            <Route path="/room/:roomId" element={
              <ProtectedRoute>
                <RoomPage />
              </ProtectedRoute>
            } />
            <Route path="/game/:roomId" element={
              <ProtectedRoute>
                <GamePage />
              </ProtectedRoute>
            } />
          </Routes>
          <ToastContainer />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
