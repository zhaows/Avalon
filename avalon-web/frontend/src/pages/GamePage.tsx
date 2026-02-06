/**
 * Game page - Main game interface.
 * Optimized: Left-right layout with role/players on left, messages on right.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gameApi, roomApi } from '../api';
import { useGameStore } from '../store/gameStore';
import { Player, Role, Team } from '../types';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from '../store/toastStore';

interface RoleInfo {
  role: Role;
  team: Team;
  info: string;
  role_notes: string;
  personality?: string;  // 玩家人设
}

interface GameStateResponse {
  phase: string;
  is_running: boolean;
  role_info: RoleInfo | null;
  host_id: string | null;
  players: Player[];
}

export default function GamePage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const { playerId, playerName, messages, connect, disconnect, sendMessage, hostGameState } = useGameStore();
  
  const [gameState, setGameState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedPersonality, setExpandedPersonality] = useState<string | null>(null);  // 展开的玩家ID
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if current player is host
  const isHost = gameState?.host_id === playerId;

  useEffect(() => {
    console.log('GamePage useEffect - roomId:', roomId, 'playerId:', playerId, 'playerName:', playerName);
    if (!roomId || !playerId) {
      console.log('Missing roomId or playerId, navigating to home');
      navigate('/');
      return;
    }

    // 游戏页使用专用连接（会踢掉其他页面的游戏连接）
    connect(true);
    loadGameState();
    
    // Poll for game state less frequently since messages come via WebSocket
    const interval = setInterval(loadGameState, 5000);
    return () => clearInterval(interval);
  }, [roomId, playerId]);

  // 监听被踢出事件
  useEffect(() => {
    const handleKicked = (event: CustomEvent) => {
      toast.warning(event.detail.reason || '您已在其他页面打开游戏');
      navigate(`/room/${roomId}`);
    };
    
    window.addEventListener('ws-kicked', handleKicked as EventListener);
    return () => window.removeEventListener('ws-kicked', handleKicked as EventListener);
  }, [navigate, roomId]);

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
    // Also handle mobile/iOS page hide
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [roomId, playerId]);

  // Listen for waiting_input messages
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === 'waiting_input') {
      // Check if this input request is for current player
      const targetPlayer = lastMsg.content?.player_name || lastMsg.player_name;
      if (targetPlayer === playerName) {
        setWaitingForInput(true);
      }
    }
    // Handle game_stopped - navigate back to room page
    if (lastMsg?.type === 'game_stopped') {
      navigate(`/room/${roomId}`);
    }
  }, [messages, playerName, navigate, roomId]);

  // Auto-scroll to bottom when new messages arrive (if enabled)
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const loadGameState = async () => {
    if (!roomId || !playerId) return;
    
    try {
      console.log('Loading game state...');
      const state = await gameApi.getState(roomId, playerId);
      console.log('Game state loaded:', state);
      setGameState(state);
      setError('');
    } catch (err: any) {
      console.error('Error loading game state:', err.message);
      // 游戏未开始时跳转到房间页
      if (err.message.includes('游戏未开始')) {
        navigate(`/room/${roomId}`);
      } else if (err.message.includes('房间不存在') || err.message.includes('not found')) {
        // 房间不存在时直接跳转首页
        navigate('/');
      } else {
        // For other errors, just show error but don't navigate
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendInput = () => {
    if (!inputText.trim()) return;
    
    sendMessage({
      type: 'player_input',
      content: inputText.trim()
    });
    
    setInputText('');
    setWaitingForInput(false);
  };

  const handleRestartGame = async () => {
    if (!roomId || !playerId) return;
    
    try {
      await gameApi.restart(roomId, playerId);
      // Navigate back to room page to start a new game
      navigate(`/room/${roomId}`);
    } catch (err: any) {
      setError(err.message);
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

  const handleEndGameClick = () => {
    setShowEndGameModal(true);
  };

  const handleConfirmEndGame = async () => {
    if (!roomId || !playerId) return;
    
    setShowEndGameModal(false);
    
    try {
      // Stop game but keep all players in room
      await gameApi.stop(roomId, playerId);
      navigate(`/room/${roomId}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">加载游戏中...</div>
      </div>
    );
  }

  // If gameState failed to load but we're still in game, show messages anyway
  if (!gameState && !loading) {
    // Continue rendering with messages only
  }

  // Get phase display text
  const getPhaseText = () => {
    if (!gameState) return '未知';
    if (!gameState.is_running) return '游戏已结束';
    return '游戏进行中';
  };

  const getSourceColor = (source: string) => {
    if (source === 'Host') return 'text-yellow-400';
    if (source === playerName) return 'text-blue-400';
    return 'text-green-400';
  };

  const getSourceEmoji = (source: string) => {
    if (source === 'Host') return '🎭';
    return '👤';
  };

  // 角色信息
  const roleInfo = gameState?.role_info;
  const isGood = roleInfo?.team === 'good';

  // 阶段配置
  const PHASE_LABELS: Record<string, { label: string; emoji: string }> = {
    team_select: { label: '组队', emoji: '👑' },
    speaking: { label: '发言', emoji: '💬' },
    voting: { label: '投票', emoji: '🗳️' },
    mission: { label: '任务', emoji: '⚔️' },
    assassinate: { label: '刺杀', emoji: '🗡️' },
    game_over: { label: '结束', emoji: '🏆' },
  };
  const phaseInfo = hostGameState?.phase ? PHASE_LABELS[hostGameState.phase] : null;

  return (
    <div className="h-screen p-3 flex flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 顶部状态栏 */}
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-2 sm:p-3 mb-3 flex-shrink-0 border border-slate-700/50 shadow-lg">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* 游戏标题 - 移动端隐藏文字 */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <span className="text-lg sm:text-xl">🏰</span>
            <span className="font-bold text-white text-sm sm:text-lg hidden sm:inline">阿瓦隆</span>
          </div>
          
          <div className="hidden sm:block w-px h-6 bg-slate-600/50 flex-shrink-0"></div>

          {/* 游戏状态标签 - 移动端紧凑一行 */}
          {phaseInfo && (
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <div className="flex items-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30">
                <span className="text-xs sm:text-base">{phaseInfo.emoji}</span>
                <span className="text-[10px] sm:text-sm font-medium text-purple-300">{phaseInfo.label}</span>
              </div>
              <div className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-lg bg-slate-700/50 text-[10px] sm:text-sm text-slate-300">
                R<span className="text-yellow-400 font-bold">{hostGameState?.mission_round || 1}</span>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-2 px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-lg bg-slate-700/50">
                <span className="text-blue-400 font-bold text-[10px] sm:text-sm">{hostGameState?.mission_success_count || 0}</span>
                <span className="text-slate-500 text-[10px] sm:text-xs">:</span>
                <span className="text-red-400 font-bold text-[10px] sm:text-sm">{hostGameState?.mission_fail_count || 0}</span>
              </div>
              {hostGameState?.captain && (
                <div className="hidden md:flex px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs sm:text-sm items-center gap-1">
                  <span className="text-yellow-400">👑</span>
                  <span className="text-yellow-300 font-medium">{hostGameState.captain}</span>
                </div>
              )}
            </div>
          )}

          {/* 轮到你提示 - 移动端精简 */}
          {hostGameState?.next_player === playerName && (
            <div className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-lg bg-gradient-to-r from-blue-500/30 to-cyan-500/30 border border-blue-400/50 animate-pulse flex-shrink-0">
              <span className="text-blue-300 font-bold text-[10px] sm:text-sm">⭐<span className="hidden sm:inline"> 轮到你</span></span>
            </div>
          )}

          {/* 右侧操作按钮 */}
          <div className="flex-1 min-w-0"></div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button 
              onClick={() => setAutoScroll(!autoScroll)} 
              className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs flex items-center gap-1 sm:gap-1.5 transition-all
                ${autoScroll 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'}`}
            >
              {autoScroll ? '⏬' : '⏸️'} <span className="hidden sm:inline">{autoScroll ? '自动滚动' : '已暂停'}</span>
            </button>
            {isHost && gameState?.is_running && (
              <button 
                onClick={handleEndGameClick} 
                className="px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 sm:gap-1.5 hover:bg-red-500/30 transition-all"
              >
                🛑 <span className="hidden sm:inline">结束游戏</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区：桌面左右布局，移动端上下布局 */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 min-h-0 overflow-hidden">
        {/* 左侧/顶部面板：角色+玩家 - 移动端更紧凑 */}
        <div className="lg:w-72 flex-shrink-0 flex flex-col lg:flex-col gap-1.5 lg:gap-3 overflow-y-auto lg:overflow-y-auto max-h-[22vh] sm:max-h-[28vh] lg:max-h-none">
          {/* 移动端横向布局：角色卡片 + 玩家列表并排 */}
          <div className="flex flex-row lg:flex-col gap-1.5 lg:gap-3">
            {/* 角色卡片 */}
            <div className={`rounded-lg lg:rounded-xl p-2 lg:p-4 shadow-lg transition-all flex-1 lg:flex-none ${
              isGood 
                ? 'bg-gradient-to-br from-blue-900/40 to-cyan-900/30 border border-blue-500/40' 
                : 'bg-gradient-to-br from-red-900/40 to-orange-900/30 border border-red-500/40'
            }`}>
              <div className="flex items-center gap-1.5 lg:gap-3 mb-1 lg:mb-3">
                <div className={`w-8 h-8 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl flex items-center justify-center text-lg lg:text-3xl shadow-inner ${
                  isGood ? 'bg-blue-500/20' : 'bg-red-500/20'
                }`}>
                  {roleInfo?.role === '梅林' ? '🧙' : roleInfo?.role === '派西维尔' ? '🛡️' : roleInfo?.role === '忠臣' ? '⚔️' : roleInfo?.role === '刺客' ? '🗡️' : roleInfo?.role === '莘甘娜' ? '🦹' : roleInfo?.role === '奥伯伦' ? '👻' : roleInfo?.role === '莘德雷德' ? '😈' : '🎭'}
                </div>
              <div>
                <div className="font-bold text-white text-sm lg:text-lg">{roleInfo?.role || '等待分配'}</div>
                <div className={`text-[10px] lg:text-sm font-medium ${isGood ? 'text-blue-400' : 'text-red-400'}`}>
                  {roleInfo ? (isGood ? '✨ 好人阵营' : '💀 坏人阵营') : '...'}
                </div>
              </div>
            </div>
            
            {/* 玩家人设 */}
            {roleInfo?.personality && (
              <div className="mb-2 lg:mb-3 group relative">
                <div className="p-1.5 lg:p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 cursor-help">
                  <div className="text-[10px] lg:text-xs text-purple-400 mb-0.5 lg:mb-1 font-medium">🎭 你的人设</div>
                  <div className="text-[10px] lg:text-sm text-purple-200 truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                    {roleInfo.personality}
                  </div>
                </div>
                {/* 悬浮提示框 */}
                <div className="absolute left-0 right-0 top-full mt-1 p-3 rounded-lg bg-slate-800 border border-purple-500/50 shadow-xl z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="text-sm text-purple-200">{roleInfo.personality}</div>
                </div>
              </div>
            )}

            {/* 角色知道的信息 */}
            {roleInfo?.info && roleInfo.info !== '无' && (
              <div className="p-1.5 lg:p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="text-[10px] lg:text-xs text-yellow-400 mb-0.5 lg:mb-1.5 font-medium">💡 你知道的秘密</div>
                <div className="text-[10px] lg:text-sm text-yellow-200 leading-relaxed">{roleInfo.info}</div>
              </div>
            )}
            
            {/* 角色说明 */}
            {roleInfo?.role_notes && (
              <div className="mt-2 lg:mt-3 pt-2 lg:pt-3 border-t border-slate-600/30">
                <div className="text-[10px] lg:text-xs text-slate-400 leading-relaxed">
                  📖 {roleInfo.role_notes}
                </div>
              </div>
            )}
          </div>

          {/* 玩家列表 */}
          <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg lg:rounded-xl p-2 lg:p-4 flex-1 min-h-0 overflow-y-auto border border-slate-700/50 shadow-lg">
            <div className="flex items-center gap-1 lg:gap-2 mb-1 lg:mb-3">
              <span className="text-xs lg:text-base">👥</span>
              <span className="text-[10px] lg:text-sm font-medium text-white">玩家</span>
              <span className="text-[10px] lg:text-xs text-slate-500">({gameState?.players.length || 0})</span>
            </div>
            {/* 移动端网格布局，桌面端列表布局 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1 lg:space-y-2 lg:block">
              {gameState?.players.map((player) => {
                const isMe = player.name === playerName;
                const isCaptain = player.name === hostGameState?.captain;
                const isTeam = hostGameState?.team_members?.includes(player.name);
                const isNext = player.name === hostGameState?.next_player;
                return (
                  <div 
                    key={player.id} 
                    className={`relative px-1.5 lg:px-3 py-1 lg:py-2 rounded-md lg:rounded-lg text-[10px] lg:text-sm transition-all
                      ${isMe 
                        ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/40 shadow-sm' 
                        : isTeam 
                          ? 'bg-emerald-500/10 border border-emerald-500/30' 
                          : 'bg-slate-700/30 hover:bg-slate-700/50'}
                      ${isNext ? 'ring-1 lg:ring-2 ring-yellow-400/50' : ''}`}
                  >
                    <div className="flex items-center gap-0.5 lg:gap-2">
                      <span className="text-xs lg:text-base">{player.player_type === 'ai' ? '🤖' : '👤'}</span>
                      <span className={`flex-1 truncate ${isMe ? 'text-blue-300 font-medium' : 'text-slate-200'}`}>
                        {player.name}
                        {isMe && <span className="hidden lg:inline text-xs text-blue-400 ml-1.5 bg-blue-500/20 px-1.5 py-0.5 rounded">你</span>}
                        {/* AI玩家展示人设图标 */}
                        {player.player_type === 'ai' && player.personality && (
                          <span 
                            className="relative inline-block ml-1.5"
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
                            {/* 悬浮展示完整人设 - 使用fixed定位避免被裁剪 */}
                            {expandedPersonality === player.id && (
                              <span 
                                className="fixed z-[9999] p-2 bg-slate-800 border border-purple-500/30 rounded-lg shadow-lg max-w-[80vw]"
                                style={{ 
                                  left: '50%', 
                                  top: '50%', 
                                  transform: 'translate(-50%, -50%)' 
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-xs text-purple-300">🎭 {player.personality}</span>
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isCaptain && <span className="text-xs lg:text-sm" title="队长">👑</span>}
                        {isTeam && !isCaptain && <span className="text-xs lg:text-sm" title="队员">🎯</span>}
                        {isNext && <span className="hidden lg:inline text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">行动中</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>

        {/* 右侧/底部消息区域 - 移动端保证足够高度 */}
        <div className="flex-1 flex flex-col min-h-[40vh] lg:min-h-0">
          {error && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 消息列表 */}
          <div className="flex-1 bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 flex flex-col min-h-0 border border-slate-700/50 shadow-lg">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-700/50">
              <span className="text-base">💬</span>
              <span className="text-sm font-medium text-white">游戏消息</span>
              <span className="text-xs text-slate-500">({messages.length}条)</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="text-5xl mb-4 animate-bounce">🎮</div>
              <p className="text-base">等待游戏消息...</p>
              <p className="text-xs text-slate-500 mt-1">游戏开始后消息将显示在这里</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.type === 'game_start') {
                return (
                  <div key={index} className="text-center fade-in py-2">
                    <span className="px-4 py-2 bg-gradient-to-r from-green-600/30 to-emerald-600/30 rounded-full text-green-300 text-sm border border-green-500/30">
                      🎮 {msg.content.message || '游戏开始！'}
                    </span>
                  </div>
                );
              }

              if (msg.type === 'waiting_input') {
                const targetPlayer = msg.content?.player_name || msg.player_name;
                if (targetPlayer === playerName) {
                  return null;
                }
                return (
                  <div key={index} className="text-center fade-in py-1">
                    <span className="px-4 py-1.5 bg-yellow-600/20 rounded-full text-yellow-300 text-xs animate-pulse border border-yellow-500/30">
                      ⏳ 等待 <span className="font-medium">{targetPlayer}</span> 输入...
                    </span>
                  </div>
                );
              }
              
              if (msg.type === 'role_assigned') {
                if (msg.player_name !== playerName) {
                  return null;
                }
                return (
                  <div key={index} className="bg-gradient-to-r from-blue-900/40 to-indigo-900/30 rounded-xl p-4 border border-blue-500/40 fade-in shadow-lg">
                    <div className="flex items-center gap-2 text-blue-300 text-sm mb-2">
                      <span className="text-lg">🔮</span>
                      <span className="font-medium">你的角色信息</span>
                    </div>
                    <div className="text-white text-base">
                      角色: <span className="font-bold text-yellow-400 text-lg">{msg.content.role}</span>
                      <span className={`ml-3 px-2 py-0.5 rounded-full text-sm ${msg.content.team === 'good' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                        {msg.content.team === 'good' ? '好人阵营' : '坏人阵营'}
                      </span>
                    </div>
                    {msg.content.info && msg.content.info !== '无' && (
                      <div className="mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <span className="text-yellow-300 text-sm">💡 {msg.content.info}</span>
                      </div>
                    )}
                  </div>
                );
              }
              
              if (msg.type === 'game_message') {
                const source = msg.content?.source || msg.player_name || 'system';
                let content = msg.content?.content;
                if (typeof content !== 'string') {
                  content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                }
                
                const isHost = source === 'Host';
                const isMyMessage = source === playerName;
                
                return (
                  <div key={index} className={`rounded-xl p-3 fade-in transition-all ${
                    isHost 
                      ? 'bg-gradient-to-r from-amber-900/30 to-orange-900/20 border border-amber-500/30' 
                      : isMyMessage
                        ? 'bg-gradient-to-r from-blue-900/30 to-cyan-900/20 border border-blue-500/30'
                        : 'bg-slate-700/40 hover:bg-slate-700/50'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getSourceEmoji(source)}</span>
                      <span className={`font-semibold ${getSourceColor(source)}`}>{source}</span>
                      {isMyMessage && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">你</span>}
                    </div>
                    <div className="text-slate-200 whitespace-pre-wrap leading-relaxed pl-7">{content}</div>
                  </div>
                );
              }
              
              if (msg.type === 'game_over') {
                return (
                  <div key={index} className="bg-gradient-to-r from-yellow-900/50 via-orange-900/40 to-red-900/30 rounded-xl p-5 border-2 border-yellow-500/50 fade-in shadow-xl">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-400 mb-3">🏆 游戏结束 🏆</div>
                      <div className="text-white text-lg mb-4">{msg.content.message}</div>
                      {msg.content.roles && (
                        <div className="mt-4 p-4 bg-slate-900/50 rounded-lg">
                          <div className="text-sm text-gray-400 mb-3 font-medium">🎭 角色揭晓</div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            {Object.entries(msg.content.roles).map(([name, role]) => (
                              <span key={name} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm text-white border border-slate-700">
                                <span className="text-slate-400">{name}:</span> <span className="font-medium">{role as string}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              
              if (msg.type === 'error') {
                return (
                  <div key={index} className="bg-red-900/30 rounded-xl p-3 border border-red-500/40 fade-in flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <span className="text-red-400">错误: {msg.content.message || msg.content}</span>
                  </div>
                );
              }
              
              return null;
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        {waitingForInput && (
          <div className="mt-3 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/30 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">✏️</span>
              <span className="text-sm font-medium text-blue-300">
                {hostGameState?.phase === 'voting' ? '请对当前队伍进行投票' :
                 hostGameState?.phase === 'mission' ? '请选择任务行动' :
                 hostGameState?.phase === 'team_select' ? '轮到你组队' :
                 hostGameState?.phase === 'assassinate' ? '请选择刺杀目标' :
                 '轮到你发言或决策'}
              </span>
            </div>
            {/* 投票阶段：同意/反对 */}
            {hostGameState?.phase === 'voting' ? (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    sendMessage({ type: 'player_input', content: '同意' });
                    setWaitingForInput(false);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg text-base"
                >
                  ✓ 同意
                </button>
                <button
                  onClick={() => {
                    sendMessage({ type: 'player_input', content: '反对' });
                    setWaitingForInput(false);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl transition-all shadow-lg text-base"
                >
                  ✗ 反对
                </button>
              </div>
            ) : hostGameState?.phase === 'mission' ? (
              /* 任务阶段：成功/失败 */
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    sendMessage({ type: 'player_input', content: '成功' });
                    setWaitingForInput(false);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg text-base"
                >
                  ✓ 成功
                </button>
                <button
                  onClick={() => {
                    sendMessage({ type: 'player_input', content: '失败' });
                    setWaitingForInput(false);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl transition-all shadow-lg text-base"
                >
                  ✗ 失败
                </button>
              </div>
            ) : (
              /* 发言/组队/刺杀等阶段：文本输入 + 玩家快捷选项 */
              <div className="space-y-3">
                {/* 玩家快捷选择按钮 */}
                {gameState?.players && gameState.players.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 mb-1.5">点击插入玩家名称：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {gameState.players.filter(p => p.name !== playerName).map((player) => (
                        <button
                          key={player.id}
                          onClick={() => setInputText(prev => prev + player.name)}
                          className="px-2.5 py-1 bg-slate-700/80 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors border border-slate-600/50"
                        >
                          {player.player_type === 'ai' ? '🤖' : '👤'} {player.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* 文本输入框 */}
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendInput()}
                    placeholder="输入你的发言或决策..."
                    className="flex-1 px-4 py-3 bg-slate-900/80 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    autoFocus
                  />
                  <button
                    onClick={handleSendInput}
                    disabled={!inputText.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg"
                  >
                    发送 →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
          </div>

          {/* 游戏结束状态栏 */}
          {!gameState?.is_running && (
            <div className="mt-3 bg-gradient-to-r from-amber-900/30 to-orange-900/20 rounded-xl p-4 flex-shrink-0 border border-amber-500/30">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏁</span>
                  <span className="text-amber-300 font-medium">游戏已结束</span>
                </div>
                <div className="w-px h-6 bg-amber-500/30"></div>
                <button 
                  onClick={handleRestartGame} 
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg"
                >
                  🔄 重新开始
                </button>
                <button 
                  onClick={handleLeaveRoom} 
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg transition-all flex items-center gap-2"
                >
                  🏠 返回首页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* End game confirmation modal */}
      <ConfirmModal
        isOpen={showEndGameModal}
        title="结束本局游戏"
        message="所有玩家将返回房间，可以重新开始新的一局。"
        confirmText="确定结束"
        cancelText="继续游戏"
        type="warning"
        onConfirm={handleConfirmEndGame}
        onCancel={() => setShowEndGameModal(false)}
      />
    </div>
  );
}
