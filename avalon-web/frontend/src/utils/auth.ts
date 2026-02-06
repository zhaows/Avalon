/**
 * Authentication utilities and hooks.
 * Provides reusable auth logic for the entire application.
 */
import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

/**
 * Hook for requiring authentication.
 * Returns a function that checks auth and redirects to login if needed.
 * 
 * Usage:
 * ```tsx
 * const requireAuth = useRequireAuth();
 * 
 * const handleAction = () => {
 *   if (!requireAuth()) return;
 *   // ... do authenticated action
 * };
 * ```
 */
export function useRequireAuth() {
  const navigate = useNavigate();
  const location = useLocation();

  const requireAuth = useCallback((options?: { 
    silent?: boolean;  // 不显示提示
    returnUrl?: string;  // 自定义返回URL
  }): boolean => {
    // 直接从 store 获取最新状态，避免闭包中的旧值
    const { isLoggedIn, token, _authChecked } = useAuthStore.getState();
    
    // token 验证尚未完成时，视为未登录
    if (_authChecked && isLoggedIn && token) {
      return true;
    }

    const returnUrl = options?.returnUrl || location.pathname + location.search;
    
    if (!options?.silent) {
      toast.info('请先登录');
    }
    
    navigate('/login', { 
      state: { from: returnUrl },
      replace: false 
    });
    
    return false;
  }, [navigate, location]);

  return requireAuth;
}

/**
 * Hook for getting auth state and common auth operations.
 * 
 * Usage:
 * ```tsx
 * const { isAuthenticated, user, token, requireAuth, logout } = useAuth();
 * ```
 */
export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, token, user, logout: storeLogout } = useAuthStore();

  const requireAuth = useCallback((options?: { 
    silent?: boolean;
    returnUrl?: string;
  }): boolean => {
    // 直接从 store 获取最新状态，避免闭包中的旧值
    const { isLoggedIn: currentLoggedIn, token: currentToken, _authChecked } = useAuthStore.getState();
    
    // token 验证尚未完成时，视为未登录
    if (!_authChecked) {
      const returnUrl = options?.returnUrl || location.pathname + location.search;
      if (!options?.silent) {
        toast.info('请先登录');
      }
      navigate('/login', { state: { from: returnUrl }, replace: false });
      return false;
    }
    
    if (currentLoggedIn && currentToken) {
      return true;
    }

    const returnUrl = options?.returnUrl || location.pathname + location.search;
    
    if (!options?.silent) {
      toast.info('请先登录');
    }
    
    navigate('/login', { 
      state: { from: returnUrl },
      replace: false 
    });
    
    return false;
  }, [navigate, location]);

  const logout = useCallback(() => {
    storeLogout();
    toast.info('已退出登录');
    navigate('/');
  }, [storeLogout, navigate]);

  const redirectToLogin = useCallback((returnUrl?: string) => {
    const url = returnUrl || location.pathname + location.search;
    navigate('/login', { 
      state: { from: url },
      replace: false 
    });
  }, [navigate, location]);

  return {
    isAuthenticated: isLoggedIn && !!token,
    isLoggedIn,
    user,
    token,
    requireAuth,
    logout,
    redirectToLogin,
  };
}

/**
 * Get the return URL from navigation state.
 * Used in LoginPage to redirect back after login.
 */
export function useLoginRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn } = useAuthStore();

  const from = (location.state as any)?.from || '/';

  const redirectAfterLogin = useCallback(() => {
    navigate(from, { replace: true });
  }, [navigate, from]);

  return {
    from,
    isLoggedIn,
    redirectAfterLogin,
  };
}

/**
 * Check if user has enough AI credits.
 */
export function useAICredits() {
  const { user, isLoggedIn } = useAuthStore();
  const updateAICredits = useAuthStore(state => state.updateAICredits);

  const hasEnoughCredits = useCallback((required: number): boolean => {
    if (!isLoggedIn || !user) return false;
    return user.ai_credits >= required;
  }, [isLoggedIn, user]);

  const checkCredits = useCallback((required: number): { ok: boolean; message?: string } => {
    if (!isLoggedIn || !user) {
      return { ok: false, message: '请先登录' };
    }
    if (user.ai_credits < required) {
      return { 
        ok: false, 
        message: `AI额度不足，需要 ${required} 人次，当前剩余 ${user.ai_credits} 人次` 
      };
    }
    return { ok: true };
  }, [isLoggedIn, user]);

  const consumeCredits = useCallback((amount: number) => {
    if (user) {
      updateAICredits(user.ai_credits - amount);
    }
  }, [user, updateAICredits]);

  return {
    credits: user?.ai_credits || 0,
    hasEnoughCredits,
    checkCredits,
    consumeCredits,
  };
}
