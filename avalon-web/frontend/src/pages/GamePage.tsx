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

interface RoleInfo {
  role: Role;
  team: Team;
  info: string;
  role_notes: string;
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

    connect();
    loadGameState();
    
    // Poll for game state less frequently since messages come via WebSocket
    const interval = setInterval(loadGameState, 5000);
    return () => clearInterval(interval);
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
    <div className="h-screen p-2 flex flex-col overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="glass rounded-lg p-2 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 游戏状态标签 */}
          {phaseInfo && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-slate-700/50 text-sm">{phaseInfo.emoji} {phaseInfo.label}</span>
              <span className="px-2 py-1 rounded bg-slate-700/50 text-sm">第<span className="text-yellow-400 font-bold mx-0.5">{hostGameState?.mission_round || 1}</span>轮</span>
              <span className="px-2 py-1 rounded bg-slate-700/50 text-sm">
                <span className="text-blue-400 font-bold">{hostGameState?.mission_success_count || 0}</span>
                <span className="text-slate-500 mx-0.5">:</span>
                <span className="text-red-400 font-bold">{hostGameState?.mission_fail_count || 0}</span>
              </span>
              {hostGameState?.captain && <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 text-sm">👑 队长: {hostGameState.captain}</span>}
            </div>
          )}

          {/* 轮到你提示 */}
          {hostGameState?.next_player === playerName && (
            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-sm animate-pulse font-bold">⭐ 轮到你行动</span>
          )}

          {/* 右侧操作按钮 */}
          <div className="flex-1"></div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setAutoScroll(!autoScroll)} 
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${autoScroll ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}
              title={autoScroll ? '自动滚动已开启' : '自动滚动已暂停'}
            >
              {autoScroll ? '⏬' : '⏸️'} {autoScroll ? '自动滚动' : '暂停滚动'}
            </button>
            {isHost && gameState?.is_running && (
              <button 
                onClick={handleEndGameClick} 
                className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 flex items-center gap-1"
                title="结束当前游戏"
              >
                🛑 结束游戏
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区：左右布局 */}
      <div className="flex-1 flex gap-2 min-h-0">
        {/* 左侧面板：角色+玩家 */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
          {/* 角色卡片 */}
          <div className={`glass rounded-lg p-3 ${isGood ? 'border border-blue-500/30' : 'border border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">
                {roleInfo?.role === '梅林' ? '🧙' : roleInfo?.role === '派西维尔' ? '🛡️' : roleInfo?.role === '忠臣' ? '⚔️' : roleInfo?.role === '刺客' ? '🗡️' : roleInfo?.role === '莫甘娜' ? '🦹' : roleInfo?.role === '奥伯伦' ? '👻' : roleInfo?.role === '莫德雷德' ? '😈' : '🎭'}
              </span>
              <div>
                <div className="font-bold text-white">{roleInfo?.role || '等待分配'}</div>
                <div className={`text-xs ${isGood ? 'text-blue-400' : 'text-red-400'}`}>
                  {roleInfo ? (isGood ? '好人阵营' : '坏人阵营') : '...'}
                </div>
              </div>
            </div>
            {/* 角色知道的信息 */}
            {roleInfo?.info && roleInfo.info !== '无' && (
              <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
                <div className="text-xs text-yellow-400 mb-1">💡 你知道的信息:</div>
                <div className="text-sm text-yellow-200">{roleInfo.info}</div>
              </div>
            )}
            {/* 角色说明 */}
            {roleInfo?.role_notes && (
              <div className="mt-2 text-xs text-slate-400">
                📖 {roleInfo.role_notes}
              </div>
            )}
          </div>

          {/* 玩家列表 */}
          <div className="glass rounded-lg p-3 flex-1 min-h-0 overflow-y-auto">
            <div className="text-xs text-slate-400 mb-2">👥 玩家 ({gameState?.players.length || 0}人)</div>
            <div className="space-y-1.5">
              {gameState?.players.map((player) => {
                const isMe = player.name === playerName;
                const isCaptain = player.name === hostGameState?.captain;
                const isTeam = hostGameState?.team_members?.includes(player.name);
                const isNext = player.name === hostGameState?.next_player;
                return (
                  <div 
                    key={player.id} 
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm
                      ${isMe ? 'bg-blue-500/20 border border-blue-500/40' : isTeam ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'}
                      ${isNext ? 'ring-1 ring-yellow-400/50' : ''}`}
                  >
                    <span className="text-sm">{player.player_type === 'ai' ? '🤖' : '👤'}</span>
                    <span className={`flex-1 ${isMe ? 'text-blue-400 font-medium' : 'text-white'}`}>
                      {player.name}
                      {isMe && <span className="text-xs text-blue-300 ml-1">(你)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {isCaptain && <span className="text-xs" title="队长">👑</span>}
                      {isTeam && !isCaptain && <span className="text-xs" title="队员">🎯</span>}
                      {isNext && <span className="text-xs" title="轮到此人">⏳</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧消息区域 */}
        <div className="flex-1 flex flex-col min-h-0">
      {error && <div className="mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

          {/* 消息列表 */}
          <div className="flex-1 glass rounded-lg p-2 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <div className="text-3xl mb-2 animate-float">🎮</div>
              <p className="text-sm">等待游戏消息...</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.type === 'game_start') {
                return (
                  <div key={index} className="text-center fade-in">
                    <span className="px-3 py-1.5 bg-green-600/30 rounded-full text-green-300 text-xs">
                      🎮 {msg.content.message || '游戏开始'}
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
                  <div key={index} className="text-center fade-in">
                    <span className="px-3 py-1.5 bg-yellow-600/30 rounded-full text-yellow-300 text-xs animate-pulse">
                      ⏳ 等待 {targetPlayer} 输入...
                    </span>
                  </div>
                );
              }
              
              if (msg.type === 'role_assigned') {
                if (msg.player_name !== playerName) {
                  return null;
                }
                return (
                  <div key={index} className="bg-blue-900/30 rounded-lg p-2 border border-blue-500 fade-in">
                    <div className="text-blue-300 text-xs">🔮 你的角色信息</div>
                    <div className="text-white mt-1 text-sm">
                      角色: <span className="font-bold text-yellow-400">{msg.content.role}</span>
                      <span className={`ml-2 ${msg.content.team === 'good' ? 'text-blue-400' : 'text-red-400'}`}>
                        ({msg.content.team === 'good' ? '好人' : '坏人'})
                      </span>
                    </div>
                    {msg.content.info && msg.content.info !== '无' && (
                      <div className="text-yellow-300 text-xs mt-1">💡 {msg.content.info}</div>
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
                
                return (
                  <div key={index} className="bg-gray-700/50 rounded-lg p-2 fade-in">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{getSourceEmoji(source)}</span>
                      <span className={`font-semibold text-sm ${getSourceColor(source)}`}>{source}</span>
                      {source === playerName && <span className="text-xs text-blue-400">(你)</span>}
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap text-sm">{content}</div>
                  </div>
                );
              }
              
              if (msg.type === 'game_over') {
                return (
                  <div key={index} className="bg-gradient-to-r from-yellow-900/50 to-orange-900/50 rounded-lg p-3 border border-yellow-500 fade-in">
                    <div className="text-center">
                      <div className="text-xl font-bold text-yellow-400 mb-2">🏆 游戏结束 🏆</div>
                      <div className="text-white text-sm">{msg.content.message}</div>
                      {msg.content.roles && (
                        <div className="mt-2">
                          <div className="text-xs text-gray-400 mb-1">角色揭晓:</div>
                          <div className="flex flex-wrap gap-1 justify-center">
                            {Object.entries(msg.content.roles).map(([name, role]) => (
                              <span key={name} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-white">
                                {name}: {role as string}
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
                  <div key={index} className="bg-red-900/30 rounded-lg p-2 border border-red-500 fade-in">
                    <span className="text-red-400 text-sm">⚠️ 错误: {msg.content.message || msg.content}</span>
                  </div>
                );
              }
              
              return null;
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {waitingForInput && (
          <div className="mt-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/30 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendInput()}
                placeholder="输入发言或决策..."
                className="input flex-1 text-sm py-2"
                autoFocus
              />
              <button
                onClick={handleSendInput}
                disabled={!inputText.trim()}
                className="btn btn-primary disabled:opacity-50 px-4"
              >
                发送
              </button>
            </div>
          </div>
        )}
          </div>

          {/* 游戏结束状态栏 */}
          {!gameState?.is_running && (
            <div className="mt-2 glass rounded-lg p-2 flex-shrink-0">
              <div className="flex items-center justify-center gap-3">
                <span className="text-amber-400 text-sm">🏁 游戏已结束</span>
                <button onClick={handleRestartGame} className="btn btn-success text-sm px-3 py-1">🔄 重新开始</button>
                <button onClick={handleLeaveRoom} className="btn btn-secondary text-sm px-3 py-1">🏠 返回首页</button>
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
