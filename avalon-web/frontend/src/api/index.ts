/**
 * API client for Avalon backend.
 */

const API_BASE = '/api';

// 全局回调：当检测到登录失效时触发
let onAuthExpired: ((reason?: string) => void) | null = null;

export function setOnAuthExpired(callback: (reason?: string) => void) {
  onAuthExpired = callback;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const errorMessage = error.detail || `HTTP ${response.status}`;
    
    // 检测登录失效的错误信息
    if (response.status === 401 || 
        errorMessage.includes('登录已过期') || 
        errorMessage.includes('无效的token') ||
        errorMessage.includes('用户未登录') ||
        errorMessage.includes('token已过期') ||
        errorMessage.includes('请先登录')) {
      // 判断是否是被踢出（其他设备登录）
      const reason = errorMessage.includes('其他设备') || errorMessage.includes('被踢出')
        ? '您的账号在其他设备登录，当前设备已下线'
        : undefined;
      // 触发全局登录失效回调
      if (onAuthExpired) {
        onAuthExpired(reason);
      }
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
}

// Room APIs
export const roomApi = {
  list: () => 
    request<{ rooms: any[] }>('/rooms'),

  create: (roomName: string, playerName: string, token?: string | null) =>
    request<{ room_id: string; player_id: string; player_name: string }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ room_name: roomName, player_name: playerName, token }),
    }),

  get: (roomId: string) =>
    request<any>(`/rooms/${roomId}`),

  join: (roomId: string, playerName: string, token?: string | null) =>
    request<{ player_id: string; player_name: string; seat: number }>(
      `/rooms/${roomId}/join`,
      {
        method: 'POST',
        body: JSON.stringify({ player_name: playerName, token }),
      }
    ),

  addAI: (roomId: string, count: number = 1, names?: string[], token?: string | null, 
          players?: Array<{ name: string; personality: string }>) =>
    request<{ added: any[]; total_players: number }>(
      `/rooms/${roomId}/ai`,
      {
        method: 'POST',
        body: JSON.stringify({ count, names, token, players }),
      }
    ),

  removeAI: (roomId: string, aiPlayerId: string, playerId: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}/ai/${aiPlayerId}?player_id=${playerId}`,
      { method: 'DELETE' }
    ),

  leave: (roomId: string, playerId: string) =>
    request<{ success: boolean }>(
      `/rooms/${roomId}/leave?player_id=${playerId}`,
      { method: 'POST' }
    ),

  // 房主删除房间（从首页操作）
  delete: (roomId: string, token: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}?token=${token}`,
      { method: 'DELETE' }
    ),

  // 房主结束游戏（从首页操作，房间回到等待状态）
  stopGameFromHome: (roomId: string, token: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}/stop-from-home?token=${token}`,
      { method: 'POST' }
    ),
};

// Game APIs
export const gameApi = {
  // Start the game - this triggers Swarm team.run_stream()
  start: (roomId: string, playerId: string, token?: string | null) =>
    request<{ success: boolean; message: string; ai_consumed?: number }>(
      `/rooms/${roomId}/start?player_id=${playerId}${token ? `&token=${token}` : ''}`,
      { method: 'POST' }
    ),

  // Stop the game (keep all players in room)
  stop: (roomId: string, playerId: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}/stop?player_id=${playerId}`,
      { method: 'POST' }
    ),

  // Restart the game (reset to waiting state)
  restart: (roomId: string, playerId: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}/restart?player_id=${playerId}`,
      { method: 'POST' }
    ),

  // Get current game state (for player's role info and player list)
  getState: (roomId: string, playerId: string) =>
    request<any>(`/rooms/${roomId}/state?player_id=${playerId}`),
};

// Auth APIs
export const authApi = {
  register: (username: string, password: string) =>
    request<{ success: boolean; message: string; token: string; user: any }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    ),

  login: (username: string, password: string) =>
    request<{ success: boolean; message: string; token: string; user: any }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    ),

  // 发送短信验证码
  sendSMS: (phone: string) =>
    request<{ success: boolean; message: string }>('/auth/send-sms', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  // 手机号验证码登录/注册
  phoneLogin: (phone: string, code: string) =>
    request<{ success: boolean; message: string; token: string; user: any }>(
      '/auth/phone-login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      }
    ),

  // 获取微信扫码登录URL
  getWeChatQRCode: (state?: string) =>
    request<{ oauth_url: string }>(
      `/auth/wechat-qrcode${state ? `?state=${state}` : ''}`
    ),

  // 微信授权登录
  wechatLogin: (code: string) =>
    request<{ success: boolean; message: string; token: string; user: any }>(
      '/auth/wechat-login',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      }
    ),

  // 微信小程序登录
  wechatMPLogin: (code: string) =>
    request<{ success: boolean; message: string; token: string; user: any }>(
      '/auth/wechat-mp-login',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      }
    ),

  logout: (token: string) =>
    request<{ success: boolean }>(`/auth/logout?token=${token}`, {
      method: 'POST',
    }),

  getUserInfo: (token: string) =>
    request<{ user: any }>(`/user/info?token=${token}`),

  getAICredits: (token: string) =>
    request<{ ai_credits: number; total_ai_used: number }>(
      `/user/ai-credits?token=${token}`
    ),

  getFavoriteAINames: (token: string) =>
    request<{ names: string[] }>(`/user/favorite-ai-names?token=${token}`),

  addFavoriteAIName: (token: string, name: string) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-names?token=${token}`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    ),

  removeFavoriteAIName: (token: string, name: string) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-names/${encodeURIComponent(name)}?token=${token}`,
      { method: 'DELETE' }
    ),

  updateFavoriteAINames: (token: string, names: string[]) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-names?token=${token}`,
      {
        method: 'PUT',
        body: JSON.stringify({ names }),
      }
    ),

  // 常用AI玩家信息管理（含personality）
  getFavoriteAIPlayers: (token: string) =>
    request<{ players: Array<{ name: string; personality: string }> }>(
      `/user/favorite-ai-players?token=${token}`
    ),

  addFavoriteAIPlayer: (token: string, name: string, personality: string = '') =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-players?token=${token}`,
      {
        method: 'POST',
        body: JSON.stringify({ name, personality }),
      }
    ),

  updateFavoriteAIPlayer: (token: string, name: string, personality: string) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-players/${encodeURIComponent(name)}?token=${token}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name, personality }),
      }
    ),

  removeFavoriteAIPlayer: (token: string, name: string) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-players/${encodeURIComponent(name)}?token=${token}`,
      { method: 'DELETE' }
    ),

  updateFavoriteAIPlayers: (token: string, players: Array<{ name: string; personality: string }>) =>
    request<{ success: boolean; message: string }>(
      `/user/favorite-ai-players?token=${token}`,
      {
        method: 'PUT',
        body: JSON.stringify({ players }),
      }
    ),
};

// 支付相关API
export const paymentApi = {
  // 获取充值套餐列表
  getPackages: () =>
    request<{
      packages: Array<{
        credits: number;
        price: number;
        price_yuan: number;
        description: string;
        unit_price: number;
      }>;
    }>('/payment/packages'),

  // 创建订单
  createOrder: (token: string, credits: number, paymentMethod: string = 'wechat') =>
    request<{
      success: boolean;
      message: string;
      order: {
        order_id: string;
        credits: number;
        amount: number;
        amount_yuan: number;
        payment_method: string;
        status: string;
      };
      pay_url: string | null;
    }>(`/payment/order?token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ credits, payment_method: paymentMethod }),
    }),

  // 查询订单状态
  getOrderStatus: (token: string, orderId: string) =>
    request<{
      order: {
        id: string;
        status: string;
        credits: number;
        amount: number;
        created_at: string;
        paid_at: string | null;
      };
    }>(`/payment/order/${orderId}?token=${token}`),

  // 获取用户订单列表
  getOrders: (token: string) =>
    request<{
      orders: Array<{
        id: string;
        status: string;
        credits: number;
        amount: number;
        created_at: string;
        paid_at: string | null;
      }>;
    }>(`/payment/orders?token=${token}`),

  // 模拟支付（开发环境）
  simulatePayment: (token: string, orderId: string) =>
    request<{
      success: boolean;
      message: string;
      user: any;
    }>(`/payment/simulate/${orderId}?token=${token}`, {
      method: 'POST',
    }),
};
