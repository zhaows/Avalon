/**
 * Protected Route Component.
 * Wraps routes that require authentication.
 * 
 * Usage:
 * ```tsx
 * <Route path="/room/:roomId" element={
 *   <ProtectedRoute>
 *     <RoomPage />
 *   </ProtectedRoute>
 * } />
 * ```
 */
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { isLoggedIn, token, _hasHydrated } = useAuthStore();

  // 等待从 localStorage 恢复状态完成
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="text-slate-400">加载中...</span>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login with return URL
  if (!isLoggedIn || !token) {
    return (
      <Navigate 
        to="/login" 
        state={{ from: location.pathname + location.search }} 
        replace 
      />
    );
  }

  return <>{children}</>;
}

/**
 * Guest Route Component.
 * For pages that should only be accessible when NOT logged in (e.g., login page).
 * Redirects to home if already logged in.
 */
interface GuestRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

export function GuestRoute({ children, redirectTo = '/' }: GuestRouteProps) {
  const location = useLocation();
  const { isLoggedIn, token, _hasHydrated } = useAuthStore();

  // 等待从 localStorage 恢复状态完成
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="text-slate-400">加载中...</span>
        </div>
      </div>
    );
  }

  // If authenticated, redirect to original destination or home
  if (isLoggedIn && token) {
    const from = (location.state as any)?.from || redirectTo;
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}
