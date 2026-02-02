/**
 * Room page - Waiting room before game starts.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { roomApi, gameApi, authApi } from '../api';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { Room, Player } from '../types';
import UserInfoPanel, { PERSONALITY_OPTIONS } from '../components/UserInfoPanel';
import BuyCreditsModal from '../components/BuyCreditsModal';
import { toast } from '../store/toastStore';

export default function RoomPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const { playerId, setRoom, connect, disconnect, isConnected, messages } = useGameStore();
  const { token, user, isLoggedIn, updateAICredits } = useAuthStore();
  
  const [room, setRoomData] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [showAINameModal, setShowAINameModal] = useState(false);
  const [aiNameInput, setAINameInput] = useState('');
  const [addingAICount, setAddingAICount] = useState(0);
  const [expandedPersonality, setExpandedPersonality] = useState<string | null>(null);  // 展开的玩家ID
  const [selectedAIPlayers, setSelectedAIPlayers] = useState<Array<{ name: string; personality: string }>>([]);  // 选中的常用AI玩家
  const [manualAIPersonalities, setManualAIPersonalities] = useState<string[]>([]);  // 手动输入AI的人设
  const [showAddFavoriteForm, setShowAddFavoriteForm] = useState(false);  // 显示添加常用AI表单
  const [newFavoriteName, setNewFavoriteName] = useState('');  // 新常用AI名称
  const [newFavoritePersonality, setNewFavoritePersonality] = useState('');  // 新常用AI人设
  const [editingFavorite, setEditingFavorite] = useState<string | null>(null);  // 正在编辑的常用AI名称
  const [editFavoritePersonality, setEditFavoritePersonality] = useState('');  // 编辑中的人设
  const [showBuyModal, setShowBuyModal] = useState(false);  // 显示购买额度弹窗

  useEffect(() => {
    if (!roomId || !playerId) {
      navigate('/');
      return;
    }

    loadRoom();
    connect();

    const interval = setInterval(loadRoom, 2000);
    return () => {
      clearInterval(interval);
    };
  }, [roomId, playerId]);

  // Auto leave room when page is closed/refreshed
  useEffect(() => {
    if (!roomId || !playerId) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery on page close
      const apiHost = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
      const url = `${apiHost}/api/rooms/${roomId}/leave?player_id=${playerId}`;
      navigator.sendBeacon(url);
    };

    // Listen for page close/refresh
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [roomId, playerId]);

  // Refresh room data when relevant messages arrive
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && ['player_joined', 'player_left', 'host_changed'].includes(lastMsg.type)) {
      loadRoom();
    }
  }, [messages]);

  useEffect(() => {
    // Check if game has started
    if (room?.phase && room.phase !== 'waiting') {
      navigate(`/game/${roomId}`);
    }
  }, [room?.phase]);

  const loadRoom = async () => {
    if (!roomId) return;
    
    try {
      const data = await roomApi.get(roomId);
      setRoomData(data);
      setRoom(data);
    } catch (err: any) {
      // 房间不存在时直接跳转到首页
      navigate('/');
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleAddAI = async (count: number, names?: string[], 
                              players?: Array<{ name: string; personality: string }>) => {
    if (!roomId) return;
    
    // 添加AI需要登录
    if (!isLoggedIn || !token) {
      setError('添加AI玩家需要先登录');
      return;
    }
    
    try {
      await roomApi.addAI(roomId, count, names, token, players);
      await loadRoom();
      // 注意：添加AI时不扣除额度，只在开始游戏时才扣除
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShowAINameModal = (count: number) => {
    setAddingAICount(count);
    setAINameInput('');
    setSelectedAIPlayers([]);
    setManualAIPersonalities(new Array(count).fill(''));  // 初始化人设数组
    setShowAddFavoriteForm(false);
    setNewFavoriteName('');
    setNewFavoritePersonality('');
    setShowAINameModal(true);
  };

  const handleConfirmAddAI = () => {
    // 优先使用选中的常用AI玩家（带personality）
    if (selectedAIPlayers.length > 0) {
      handleAddAI(selectedAIPlayers.length, undefined, selectedAIPlayers);
    } else {
      // 否则使用输入的名字，配合人设
      const names = aiNameInput.trim() 
        ? aiNameInput.split(/[,，\s]+/).filter(n => n.trim()).map(n => n.trim())
        : undefined;
      
      // 如果有设置人设，构建players数组
      if (names && manualAIPersonalities.some(p => p.trim())) {
        const players = names.map((name, i) => ({
          name,
          personality: manualAIPersonalities[i] || ''
        }));
        handleAddAI(names.length, undefined, players);
      } else if (manualAIPersonalities[0]?.trim() && addingAICount === 1) {
        // 单个AI没有输入名字但有人设
        handleAddAI(1, undefined, [{ name: '', personality: manualAIPersonalities[0] }]);
      } else {
        handleAddAI(addingAICount, names);
      }
    }
    setShowAINameModal(false);
  };

  // 添加常用AI玩家
  const handleAddFavoriteAIPlayer = async () => {
    if (!newFavoriteName.trim() || !token) return;
    
    try {
      await authApi.addFavoriteAIPlayer(token, newFavoriteName.trim(), newFavoritePersonality);
      useAuthStore.getState().addFavoriteAIPlayer({
        name: newFavoriteName.trim(),
        personality: newFavoritePersonality
      });
      setNewFavoriteName('');
      setNewFavoritePersonality('');
      setShowAddFavoriteForm(false);
      toast.success('已添加到常用AI玩家');
    } catch (err: any) {
      toast.error(err.message || '添加失败');
    }
  };

  // 开始编辑常用AI玩家
  const startEditFavorite = (player: { name: string; personality: string }) => {
    setEditingFavorite(player.name);
    setEditFavoritePersonality(player.personality);
  };

  // 更新常用AI玩家
  const handleUpdateFavoriteAIPlayer = async (name: string) => {
    if (!token) return;
    
    try {
      await authApi.updateFavoriteAIPlayer(token, name, editFavoritePersonality);
      useAuthStore.getState().updateFavoriteAIPlayer(name, editFavoritePersonality);
      setEditingFavorite(null);
      toast.success('更新成功');
    } catch (err: any) {
      toast.error(err.message || '更新失败');
    }
  };

  // 删除常用AI玩家
  const handleRemoveFavoriteAIPlayer = async (name: string) => {
    if (!token) return;
    
    try {
      await authApi.removeFavoriteAIPlayer(token, name);
      useAuthStore.getState().removeFavoriteAIPlayer(name);
      // 如果被删除的玩家在已选中列表中，也要移除
      setSelectedAIPlayers(prev => prev.filter(p => p.name !== name));
      toast.success('删除成功');
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const toggleSelectAIPlayer = (player: { name: string; personality: string }) => {
    const exists = selectedAIPlayers.find(p => p.name === player.name);
    if (exists) {
      setSelectedAIPlayers(selectedAIPlayers.filter(p => p.name !== player.name));
    } else if (selectedAIPlayers.length < addingAICount) {
      setSelectedAIPlayers([...selectedAIPlayers, player]);
    }
  };

  const handleRemoveAI = async (aiPlayerId: string) => {
    if (!roomId || !playerId) return;
    
    try {
      await roomApi.removeAI(roomId, aiPlayerId, playerId);
      await loadRoom();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStartGame = async () => {
    if (!roomId || !playerId) return;
    
    // 检查AI额度（如果已登录）
    const aiCount = room?.players?.filter(p => p.player_type === 'ai').length || 0;
    if (isLoggedIn && user && aiCount > user.ai_credits) {
      setError(`AI额度不足，需要 ${aiCount} 人次，当前剩余 ${user.ai_credits} 人次`);
      return;
    }
    
    setStarting(true);
    try {
      const result = await gameApi.start(roomId, playerId, token);
      // 更新本地AI额度
      if (isLoggedIn && user && result.ai_consumed) {
        updateAICredits(user.ai_credits - result.ai_consumed);
      }
      navigate(`/game/${roomId}`);
    } catch (err: any) {
      setError(err.message);
      setStarting(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!roomId || !playerId) return;
    
    try {
      await roomApi.leave(roomId, playerId);
      disconnect();
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="text-slate-400">加载房间信息...</span>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center glass rounded-2xl p-8">
          <div className="text-5xl mb-4">😕</div>
          <div className="text-xl text-white mb-2">房间不存在</div>
          <p className="text-slate-400 mb-6">该房间可能已被解散</p>
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const isHost = room.host_id === playerId;
  const canStart = room.players.length === 7;
  const emptySlots = 7 - room.players.length;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="glass rounded-2xl p-6 mb-6 fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{room.name}</h1>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-400">
                  房间ID: <span className="text-slate-300 font-mono">{room.id}</span>
                </span>
                <span className={`flex items-center gap-1.5 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  {isConnected ? '已连接' : '断开连接'}
                </span>
                {/* 用户信息显示 */}
                {isLoggedIn && user && (
                  <span className="text-yellow-400">
                    🎮 {user.ai_credits} AI额度
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 用户状态 */}
              <UserInfoPanel compact />
              <button
                onClick={handleLeaveRoom}
                className="btn btn-danger"
              >
                <span>🚪</span> 离开房间
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 fade-in">
            {error}
          </div>
        )}

        {/* Player Grid */}
        <div className="glass rounded-2xl p-6 mb-6 fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>👥</span> 玩家列表
            </h2>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 w-32 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${(room.players.length / 7) * 100}%` }}
                ></div>
              </div>
              <span className="text-slate-300 font-medium">{room.players.length}/7</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {room.players.map((player: Player, index: number) => (
              <div
                key={player.id}
                className={`group relative p-4 rounded-xl border-2 transition-all duration-300 card-hover
                  ${player.id === playerId
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                  }`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                    ${player.player_type === 'ai' 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {player.player_type === 'ai' ? '🤖' : '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold truncate">{player.name}</span>
                      {player.id === room.host_id && (
                        <span className="text-yellow-400 text-lg" title="房主">👑</span>
                      )}
                      {/* AI玩家展示人设图标 */}
                      {player.player_type === 'ai' && player.personality && (
                        <span 
                          className="relative"
                          onMouseLeave={() => setExpandedPersonality(null)}
                        >
                          <span 
                            className="text-purple-400/80 cursor-pointer hover:text-purple-300 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPersonality(expandedPersonality === player.id ? null : player.id);
                            }}
                          >
                            🎭
                          </span>
                          {/* 悬浮展示完整人设 */}
                          {expandedPersonality === player.id && (
                            <span 
                              className="absolute z-50 left-0 top-full mt-1 p-2 bg-slate-800 border border-purple-500/30 rounded-lg shadow-lg whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-purple-300">🎭 {player.personality}</span>
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">座位 {player.seat}</span>
                      {player.id === playerId && (
                        <span className="text-blue-400">(你)</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Remove AI button */}
                  {isHost && player.player_type === 'ai' && (
                    <button
                      onClick={() => handleRemoveAI(player.id)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/20 
                                 text-red-400 hover:bg-red-500/30 flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="移除AI玩家"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="p-4 rounded-xl border-2 border-dashed border-slate-700/50
                           flex items-center justify-center h-[84px]"
              >
                <span className="text-slate-500 text-sm">等待玩家加入...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Panel */}
        <div className="glass rounded-2xl p-6 fade-in" style={{ animationDelay: '0.2s' }}>
          {isHost ? (
            <>
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <span>🎮</span> 房主操作
              </h2>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleShowAINameModal(1)}
                  disabled={room.players.length >= 7}
                  className="btn bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>🤖</span> 添加AI
                </button>
                
                {emptySlots > 1 && (
                  <button
                    onClick={() => handleShowAINameModal(emptySlots)}
                    disabled={room.players.length >= 7}
                    className="btn bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>🤖</span> 填充AI ({emptySlots}个)
                  </button>
                )}
                
                <div className="flex-1"></div>
                
                <button
                  onClick={handleStartGame}
                  disabled={!canStart || starting}
                  className={`btn text-white font-semibold px-8
                    ${canStart 
                      ? 'btn-success' 
                      : 'bg-slate-600 cursor-not-allowed'}`}
                >
                  {starting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      开始中...
                    </>
                  ) : canStart ? (
                    <>
                      <span>🚀</span> 开始游戏
                    </>
                  ) : (
                    <>
                      <span>⏳</span> 需要7人 ({room.players.length}/7)
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-4 animate-float">⏳</div>
              <p className="text-slate-300 text-lg">等待房主开始游戏</p>
              <p className="text-slate-500 text-sm mt-2">
                房主可以添加AI玩家并开始游戏
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Name Input Modal */}
      {showAINameModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md fade-in max-h-[85vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>🤖</span> 添加AI玩家
            </h3>
            
            {/* AI额度提示 */}
            {isLoggedIn && user && (
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">🎮 AI玩家额度</span>
                  <span className={`font-bold ${user.ai_credits >= addingAICount ? 'text-green-400' : 'text-red-400'}`}>
                    {user.ai_credits} 人次
                  </span>
                </div>
                {user.ai_credits < addingAICount && (
                  <div className="mt-2">
                    <p className="text-red-400 text-xs">
                      额度不足，需要 {addingAICount} 人次
                    </p>
                    <button
                      onClick={() => { setShowAINameModal(false); setShowBuyModal(true); }}
                      className="mt-2 w-full text-xs px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 
                               hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-medium"
                    >
                      💎 购买AI额度
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* 未登录提示 */}
            {!isLoggedIn && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-sm">
                  ⚠️ 添加AI玩家需要先登录
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  新用户注册赠送20人次AI额度
                </p>
              </div>
            )}
            
            <p className="text-slate-400 text-sm mb-4">
              为 {addingAICount} 个AI玩家设置名字和人设（可选，留空使用默认）
            </p>
            
            {/* 常用AI玩家快速选择 */}
            {isLoggedIn && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">
                    ⭐ 常用AI玩家 {user?.favorite_ai_players && user.favorite_ai_players.length > 0 
                      ? `（已选 ${selectedAIPlayers.length}/${addingAICount}）` 
                      : ''}
                  </p>
                  <button
                    onClick={() => setShowAddFavoriteForm(!showAddFavoriteForm)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showAddFavoriteForm ? '收起' : '+ 添加常用'}
                  </button>
                </div>
                
                {/* 添加常用AI表单 */}
                {showAddFavoriteForm && (
                  <div className="bg-gray-700/30 rounded-lg p-3 mb-3 space-y-2">
                    <input
                      type="text"
                      value={newFavoriteName}
                      onChange={(e) => setNewFavoriteName(e.target.value)}
                      placeholder="AI名称..."
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-sm text-white placeholder-gray-400"
                      maxLength={20}
                    />
                    <select
                      value={newFavoritePersonality}
                      onChange={(e) => setNewFavoritePersonality(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-sm text-white"
                    >
                      <option value="">选择人设（可选）</option>
                      {PERSONALITY_OPTIONS.map((p, i) => (
                        <option key={i} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newFavoritePersonality}
                      onChange={(e) => setNewFavoritePersonality(e.target.value)}
                      placeholder="或自定义人设描述..."
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-sm text-white placeholder-gray-400"
                      maxLength={100}
                    />
                    <button
                      onClick={handleAddFavoriteAIPlayer}
                      disabled={!newFavoriteName.trim()}
                      className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 
                                 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
                    >
                      保存到常用
                    </button>
                  </div>
                )}
                
                {/* 已保存的常用AI列表 */}
                {user?.favorite_ai_players && user.favorite_ai_players.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {user.favorite_ai_players.map((player, index) => {
                      const isSelected = selectedAIPlayers.some(p => p.name === player.name);
                      const isEditing = editingFavorite === player.name;
                      
                      if (isEditing) {
                        // 编辑模式
                        return (
                          <div key={index} className="bg-gray-700/50 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white">{player.name}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleUpdateFavoriteAIPlayer(player.name)}
                                  className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={() => setEditingFavorite(null)}
                                  className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                            <select
                              value={editFavoritePersonality}
                              onChange={(e) => setEditFavoritePersonality(e.target.value)}
                              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm text-white"
                            >
                              <option value="">无人设（随机分配）</option>
                              {PERSONALITY_OPTIONS.map((p, i) => (
                                <option key={i} value={p}>{p}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editFavoritePersonality}
                              onChange={(e) => setEditFavoritePersonality(e.target.value)}
                              placeholder="或自定义人设描述..."
                              className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm text-white placeholder-gray-400"
                              maxLength={100}
                            />
                          </div>
                        );
                      }
                      
                      // 显示模式
                      return (
                        <div
                          key={index}
                          className={`w-full text-left p-2 rounded-lg transition-colors ${
                            isSelected 
                              ? 'bg-purple-600/40 border border-purple-500' 
                              : 'bg-gray-700/50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => toggleSelectAIPlayer(player)}
                              disabled={!isSelected && selectedAIPlayers.length >= addingAICount}
                              className={`flex-1 text-left ${!isSelected && selectedAIPlayers.length >= addingAICount ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className="font-medium text-white">{player.name}</span>
                              {player.personality && (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                                  🎭 {player.personality}
                                </p>
                              )}
                            </button>
                            <div className="flex items-center gap-2 ml-2">
                              {isSelected && <span className="text-purple-400">✓</span>}
                              <button
                                onClick={(e) => { e.stopPropagation(); startEditFavorite(player); }}
                                className="text-blue-400 hover:text-blue-300 text-sm p-1"
                                title="编辑"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveFavoriteAIPlayer(player.name); }}
                                className="text-red-400 hover:text-red-300 text-sm p-1"
                                title="删除"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !showAddFavoriteForm && (
                  <p className="text-sm text-gray-500 italic">
                    暂无常用AI玩家，点击上方"添加常用"按钮添加
                  </p>
                )}
                
                {selectedAIPlayers.length > 0 && (
                  <p className="text-xs text-purple-400 mt-2">
                    将使用选中的 {selectedAIPlayers.length} 个常用AI玩家
                  </p>
                )}
              </div>
            )}
            
            {/* 手动输入（当没有选择常用玩家时） */}
            {selectedAIPlayers.length === 0 && (
              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs text-gray-500 mb-2">
                  {isLoggedIn && user?.favorite_ai_players && user.favorite_ai_players.length > 0 
                    ? '或手动输入AI信息：' 
                    : '输入AI信息：'}
                </p>
                <input
                  type="text"
                  value={aiNameInput}
                  onChange={(e) => setAINameInput(e.target.value)}
                  placeholder={addingAICount === 1 ? "AI名字（可选）..." : "用逗号分隔多个名字，如：张三, 李四"}
                  className="input w-full mb-3"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowAINameModal(false);
                  }}
                />
                
                {/* 人设选择 */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">选择人设风格（可选）：</p>
                  <select
                    value={manualAIPersonalities[0] || ''}
                    onChange={(e) => {
                      const newPersonalities = [...manualAIPersonalities];
                      newPersonalities[0] = e.target.value;
                      setManualAIPersonalities(newPersonalities);
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                  >
                    <option value="">无人设（随机分配）</option>
                    {PERSONALITY_OPTIONS.map((p, i) => (
                      <option key={i} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={manualAIPersonalities[0] || ''}
                    onChange={(e) => {
                      const newPersonalities = [...manualAIPersonalities];
                      newPersonalities[0] = e.target.value;
                      setManualAIPersonalities(newPersonalities);
                    }}
                    placeholder="或自定义人设描述..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400"
                    maxLength={100}
                  />
                  {addingAICount === 1 && manualAIPersonalities[0]?.trim() && (
                    <p className="text-xs text-green-400">
                      ✓ 已设置人设：{manualAIPersonalities[0].slice(0, 30)}{manualAIPersonalities[0].length > 30 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowAINameModal(false)}
                className="btn bg-slate-600 hover:bg-slate-500 text-white"
              >
                取消
              </button>
              <button
                onClick={handleConfirmAddAI}
                disabled={!isLoggedIn || !!(isLoggedIn && user && user.ai_credits < (selectedAIPlayers.length || addingAICount))}
                className="btn bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 
                           disabled:cursor-not-allowed text-white"
              >
                {!isLoggedIn ? '请先登录' : selectedAIPlayers.length > 0 ? `添加 ${selectedAIPlayers.length} 个AI` : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 购买额度弹窗 */}
      <BuyCreditsModal isOpen={showBuyModal} onClose={() => setShowBuyModal(false)} />
    </div>
  );
}
