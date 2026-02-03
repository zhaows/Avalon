/**
 * Zustand store for user authentication and account management.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FavoriteAIPlayer {
  name: string;
  personality: string;
}

export interface UserInfo {
  id: string;
  username: string | null;
  nickname: string | null;
  display_name: string;
  phone: string | null;  // 脱敏后的手机号（如 *******1234）
  has_wechat: boolean;
  avatar_url: string | null;
  ai_credits: number;
  favorite_ai_names: string[];
  favorite_ai_players: FavoriteAIPlayer[];
  total_games: number;
  total_ai_used: number;
  created_at: string;
}

interface AuthStore {
  // Auth state
  isLoggedIn: boolean;
  token: string | null;
  user: UserInfo | null;
  _hasHydrated: boolean;  // 是否已从 localStorage 恢复状态
  
  // Actions
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  updateUser: (user: Partial<UserInfo>) => void;
  updateAICredits: (credits: number) => void;
  setFavoriteAINames: (names: string[]) => void;
  addFavoriteAIName: (name: string) => void;
  removeFavoriteAIName: (name: string) => void;
  // 常用AI玩家信息管理（含personality）
  setFavoriteAIPlayers: (players: FavoriteAIPlayer[]) => void;
  addFavoriteAIPlayer: (player: FavoriteAIPlayer) => void;
  updateFavoriteAIPlayer: (name: string, personality: string) => void;
  removeFavoriteAIPlayer: (name: string) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isLoggedIn: false,
      token: null,
      user: null,
      _hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      login: (token, user) => {
        set({ isLoggedIn: true, token, user });
      },

      logout: () => {
        set({ isLoggedIn: false, token: null, user: null });
      },

      updateUser: (userData) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...userData } });
        }
      },

      updateAICredits: (credits) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ai_credits: credits } });
        }
      },

      setFavoriteAINames: (names) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, favorite_ai_names: names } });
        }
      },

      addFavoriteAIName: (name) => {
        const { user } = get();
        if (user && !user.favorite_ai_names.includes(name)) {
          set({ 
            user: { 
              ...user, 
              favorite_ai_names: [...user.favorite_ai_names, name] 
            } 
          });
        }
      },

      removeFavoriteAIName: (name) => {
        const { user } = get();
        if (user) {
          set({ 
            user: { 
              ...user, 
              favorite_ai_names: user.favorite_ai_names.filter(n => n !== name) 
            } 
          });
        }
      },

      // 常用AI玩家信息管理（含personality）
      setFavoriteAIPlayers: (players) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, favorite_ai_players: players } });
        }
      },

      addFavoriteAIPlayer: (player) => {
        const { user } = get();
        if (user) {
          const exists = user.favorite_ai_players?.some(p => p.name === player.name);
          if (!exists) {
            set({ 
              user: { 
                ...user, 
                favorite_ai_players: [...(user.favorite_ai_players || []), player] 
              } 
            });
          }
        }
      },

      updateFavoriteAIPlayer: (name, personality) => {
        const { user } = get();
        if (user && user.favorite_ai_players) {
          set({ 
            user: { 
              ...user, 
              favorite_ai_players: user.favorite_ai_players.map(p => 
                p.name === name ? { ...p, personality } : p
              )
            } 
          });
        }
      },

      removeFavoriteAIPlayer: (name) => {
        const { user } = get();
        if (user && user.favorite_ai_players) {
          set({ 
            user: { 
              ...user, 
              favorite_ai_players: user.favorite_ai_players.filter(p => p.name !== name) 
            } 
          });
        }
      },
    }),
    {
      name: 'avalon-auth-storage', // localStorage key
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        token: state.token,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        // 当从 localStorage 恢复完成后调用
        state?.setHasHydrated(true);
      },
    }
  )
);
