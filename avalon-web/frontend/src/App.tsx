import { useEffect } from 'react'
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
  const { isLoggedIn, token, logout, login } = useAuthStore();
  const addToast = useToastStore(state => state.addToast);

  useEffect(() => {
    // 如果本地有登录状态，验证 token 是否有效
    if (isLoggedIn && token) {
      authApi.getUserInfo(token)
        .then((response) => {
          // token 有效，更新用户信息（可能有变化）
          if (response.user) {
            login(token, response.user);
          }
        })
        .catch(() => {
          // token 无效，清除登录状态
          logout();
          addToast('登录已过期，请重新登录', 'warning');
        });
    }
  }, []); // 只在应用启动时执行一次

  return null;
}

// 设置全局登录失效处理
function AuthExpiredHandler() {
  const logout = useAuthStore(state => state.logout);
  const addToast = useToastStore(state => state.addToast);
  
  useEffect(() => {
    setOnAuthExpired((reason?: string) => {
      logout();
      // 显示具体原因（如被其他设备踢出）
      const message = reason || '登录已过期，请重新登录';
      addToast(message, 'warning');
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
          addToast('您已在其他窗口登出', 'info');
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
          addToast('您已在其他窗口登出', 'info');
        }
        // 其他窗口登录了（或切换了账号）
        else if (state.isLoggedIn && state.token && state.token !== token) {
          login(state.token, state.user);
          addToast('登录状态已同步', 'info');
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
    <BrowserRouter>
      <div className="min-h-screen">
        <AnalyticsTracker />
        <AuthValidator />
        <AuthExpiredHandler />
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
  )
}

export default App
