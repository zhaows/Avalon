/**
 * User Info Panel - Display user info, AI credits, and manage favorite AI players.
 */
import { useState } from 'react';
import { useAuthStore, FavoriteAIPlayer } from '../store/authStore';
import { authApi } from '../api';
import { toast } from '../store/toastStore';
import AuthModal from './AuthModal';
import BuyCreditsModal from './BuyCreditsModal';

// 预设的人设选项 - 导出以便其他组件使用
export const PERSONALITY_OPTIONS = [
  "沉稳冷静，善于分析，发言简洁有力",
  "热情活跃，喜欢带动气氛，善于引导话题",
  "谨慎多疑，喜欢质疑他人，观察力强",
  "直来直去，说话直接，不喜欢绕弯子",
  "幽默风趣，喜欢用轻松的方式表达观点",
  "沉默寡言，只在关键时刻发表意见",
  "老谋深算，喜欢设置陷阱试探他人",
  "情绪化，容易被他人发言影响",
  "自信满满，喜欢主导讨论方向",
  "圆滑世故，善于调和各方矛盾"
];

interface UserInfoPanelProps {
  compact?: boolean;  // 紧凑模式只显示基本信息
}

export default function UserInfoPanel({ compact = false }: UserInfoPanelProps) {
  const { isLoggedIn, user, token, logout } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [newAIName, setNewAIName] = useState('');
  const [newAIPersonality, setNewAIPersonality] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editPersonality, setEditPersonality] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (token) {
      try {
        await authApi.logout(token);
      } catch (e) {
        // Ignore logout errors
      }
    }
    logout();
    toast.info('已退出登录');
  };

  const handleAddAIPlayer = async () => {
    if (!newAIName.trim() || !token) return;
    
    setLoading(true);
    try {
      await authApi.addFavoriteAIPlayer(token, newAIName.trim(), newAIPersonality);
      useAuthStore.getState().addFavoriteAIPlayer({
        name: newAIName.trim(),
        personality: newAIPersonality
      });
      setNewAIName('');
      setNewAIPersonality('');
      toast.success('添加成功');
    } catch (err: any) {
      toast.error(err.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAIPlayer = async (name: string) => {
    if (!token) return;
    
    try {
      await authApi.updateFavoriteAIPlayer(token, name, editPersonality);
      useAuthStore.getState().updateFavoriteAIPlayer(name, editPersonality);
      setEditingPlayer(null);
      toast.success('更新成功');
    } catch (err: any) {
      toast.error(err.message || '更新失败');
    }
  };

  const handleRemoveAIPlayer = async (name: string) => {
    if (!token) return;
    
    try {
      await authApi.removeFavoriteAIPlayer(token, name);
      useAuthStore.getState().removeFavoriteAIPlayer(name);
      toast.success('删除成功');
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const startEditing = (player: FavoriteAIPlayer) => {
    setEditingPlayer(player.name);
    setEditPersonality(player.personality);
  };

  // 未登录状态
  if (!isLoggedIn) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                     font-medium transition-colors flex items-center gap-2"
        >
          🔐 登录/注册
        </button>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </>
    );
  }

  // 紧凑模式 - 只显示用户名和额度
  if (compact) {
    return (
      <>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-300">👤 {user?.display_name || user?.username}</span>
          <span className="text-yellow-400">🎮 {user?.ai_credits} AI额度</span>
          <button
            onClick={() => setShowBuyModal(true)}
            className="text-purple-400 hover:text-purple-300 transition-colors"
            title="购买额度"
          >
            💎
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-400 transition-colors"
            title="退出登录"
          >
            退出
          </button>
        </div>
        <BuyCreditsModal isOpen={showBuyModal} onClose={() => setShowBuyModal(false)} />
      </>
    );
  }

  const favoriteAIPlayers = user?.favorite_ai_players || [];

  // 完整模式 - 显示详细信息和管理功能
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
      {/* 用户基本信息 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-xl overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="头像" className="w-full h-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <div className="font-bold text-white">{user?.display_name || user?.username}</div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              {user?.phone && <span>📱 {user.phone}</span>}
              {user?.has_wechat && <span>💬 微信已绑定</span>}
              {!user?.phone && !user?.has_wechat && user?.username && <span>@{user.username}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          退出登录
        </button>
      </div>

      {/* AI额度信息 */}
      <div className="bg-gray-700/50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-300">🎮 AI玩家额度</span>
          <span className="text-xl font-bold text-yellow-400">
            {user?.ai_credits} 人次
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-gray-500">
            累计使用: {user?.total_ai_used} 人次
          </div>
          <button
            onClick={() => setShowBuyModal(true)}
            className="text-xs px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 
                     hover:from-purple-500 hover:to-blue-500 text-white rounded-full
                     font-medium transition-all"
          >
            💎 购买额度
          </button>
        </div>
      </div>

      {/* 购买额度弹窗 */}
      <BuyCreditsModal isOpen={showBuyModal} onClose={() => setShowBuyModal(false)} />

      {/* 常用AI玩家管理 */}
      <div className="border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-300 font-medium">⭐ 常用AI玩家</span>
          <button
            onClick={() => setShowPlayerManager(!showPlayerManager)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {showPlayerManager ? '收起' : '管理'}
          </button>
        </div>

        {/* 已保存的AI玩家列表 */}
        {favoriteAIPlayers.length > 0 ? (
          <div className="space-y-2 mb-3">
            {favoriteAIPlayers.map((player, index) => (
              <div
                key={index}
                className="bg-gray-700/50 rounded-lg p-2"
              >
                {editingPlayer === player.name ? (
                  // 编辑模式
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{player.name}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateAIPlayer(player.name)}
                          className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingPlayer(null)}
                          className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                    <select
                      value={editPersonality}
                      onChange={(e) => setEditPersonality(e.target.value)}
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm text-white"
                    >
                      <option value="">无人设（随机分配）</option>
                      {PERSONALITY_OPTIONS.map((p, i) => (
                        <option key={i} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editPersonality}
                      onChange={(e) => setEditPersonality(e.target.value)}
                      placeholder="或自定义人设描述..."
                      className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm text-white placeholder-gray-400"
                      maxLength={100}
                    />
                  </div>
                ) : (
                  // 显示模式
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="font-medium text-white">{player.name}</span>
                      {player.personality && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                          🎭 {player.personality}
                        </p>
                      )}
                    </div>
                    {showPlayerManager && (
                      <div className="flex gap-2 ml-2">
                        <button
                          onClick={() => startEditing(player)}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                          title="编辑"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleRemoveAIPlayer(player.name)}
                          className="text-red-400 hover:text-red-300 text-sm"
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-3">暂无保存的AI玩家</p>
        )}

        {/* 添加新AI玩家 */}
        {showPlayerManager && (
          <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
            <div className="text-sm text-gray-400 mb-2">添加新AI玩家</div>
            <input
              type="text"
              value={newAIName}
              onChange={(e) => setNewAIName(e.target.value)}
              placeholder="AI玩家名称"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-white text-sm placeholder-gray-500 focus:outline-none 
                         focus:ring-1 focus:ring-blue-500"
              maxLength={20}
              disabled={loading}
            />
            <select
              value={newAIPersonality}
              onChange={(e) => setNewAIPersonality(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">无人设（随机分配）</option>
              {PERSONALITY_OPTIONS.map((p, i) => (
                <option key={i} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="text"
              value={newAIPersonality}
              onChange={(e) => setNewAIPersonality(e.target.value)}
              placeholder="或自定义人设描述（最多100字）..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-white text-sm placeholder-gray-500 focus:outline-none 
                         focus:ring-1 focus:ring-blue-500"
              maxLength={100}
              disabled={loading}
            />
            <button
              onClick={handleAddAIPlayer}
              disabled={loading || !newAIName.trim()}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white text-sm rounded transition-colors"
            >
              {loading ? '添加中...' : '添加AI玩家'}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-2">
          在房间添加AI时可快速选择常用玩家（最多20个）
        </p>
      </div>
    </div>
  );
}
