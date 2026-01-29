/**
 * Game page - Main game interface.
 * Displays messages from Swarm team run_stream.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gameApi } from '../api';
import { useGameStore } from '../store/gameStore';
import { Player, Role, Team } from '../types';
import RoleCard from '../components/RoleCard';
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
  const { playerId, playerName, messages, connect, isConnected, sendMessage } = useGameStore();
  
  const [gameState, setGameState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [showEndGameModal, setShowEndGameModal] = useState(false);
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

  // Listen for waiting_input messages
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === 'waiting_input') {
      // Check if this input request is for current player
      const targetPlayer = lastMsg.content?.player_name || lastMsg.player_name;
      if (targetPlayer === playerName) {
        setWaitingForInput(true);
        setInputPrompt(lastMsg.content?.prompt || '请输入你的发言或决策：');
      }
    }
    // Handle game_stopped - navigate back to room page
    if (lastMsg?.type === 'game_stopped') {
      navigate(`/room/${roomId}`);
    }
  }, [messages, playerName, navigate, roomId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // Only navigate away if game truly hasn't started
      if (err.message.includes('游戏未开始')) {
        navigate(`/room/${roomId}`);
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
    setInputPrompt('');
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

  return (
    <div className="h-screen p-4 md:p-6 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="glass rounded-2xl p-4 mb-4 fade-in flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <span>⚔️</span>
              <span className="gradient-text">阿瓦隆</span>
              <span className={`text-lg font-normal ml-2 px-3 py-1 rounded-full
                ${gameState?.is_running 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-amber-500/20 text-amber-400'}`}>
                {getPhaseText()}
              </span>
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className={`flex items-center gap-1.5 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                {isConnected ? '已连接' : '断开连接'}
              </span>
              <span className="text-slate-400">
                玩家: <span className="text-white font-medium">{playerName}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 fade-in">
          {error}
        </div>
      )}

      {/* Main game area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        {/* Left sidebar - Role card & Players */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
          {/* Role card */}
          {gameState?.role_info && (
            <RoleCard
              role={gameState.role_info.role}
              team={gameState.role_info.team}
              knowledge={gameState.role_info.info}
            />
          )}

          {/* Players list */}
          <div className="glass rounded-2xl p-4 fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span>👥</span> 玩家列表
            </h3>
            <div className="space-y-2">
              {gameState?.players.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-xl flex items-center gap-3 transition-all
                    ${player.name === playerName 
                      ? 'bg-blue-500/10 border border-blue-500/30' 
                      : 'bg-slate-800/50 hover:bg-slate-800'}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg
                    ${player.player_type === 'ai' 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {player.player_type === 'ai' ? '🤖' : '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white font-medium truncate block">
                      {player.name}
                      {player.name === playerName && (
                        <span className="text-blue-400 text-sm ml-1">(你)</span>
                      )}
                    </span>
                  </div>
                  <span className="text-slate-500 text-sm">{player.seat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content - Message stream */}
        <div className="lg:col-span-3 glass rounded-2xl p-4 md:p-6 flex flex-col min-h-0 fade-in" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
            <span>📜</span> 游戏记录
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="text-4xl mb-4 animate-float">🎮</div>
                <p>等待游戏消息...</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                // Handle different message types
                if (msg.type === 'game_start') {
                  return (
                    <div key={index} className="text-center fade-in">
                      <span className="px-4 py-2 bg-green-600/30 rounded-full text-green-300 text-sm">
                        🎮 {msg.content.message || '游戏开始'}
                      </span>
                    </div>
                  );
                }

                if (msg.type === 'waiting_input') {
                  // Show waiting indicator for other players, skip for the player who needs to input
                  const targetPlayer = msg.content?.player_name || msg.player_name;
                  if (targetPlayer === playerName) {
                    return null; // Will be shown in the input area below
                  }
                  return (
                    <div key={index} className="text-center fade-in">
                      <span className="px-4 py-2 bg-yellow-600/30 rounded-full text-yellow-300 text-sm animate-pulse">
                        ⏳ 等待 {targetPlayer} 输入...
                      </span>
                    </div>
                  );
                }
                
                if (msg.type === 'role_assigned') {
                  // Only show role_assigned message for the current player
                  if (msg.player_name !== playerName) {
                    return null; // Hide other players' role assignments
                  }
                  return (
                    <div key={index} className="bg-blue-900/30 rounded-lg p-3 border border-blue-500 fade-in">
                      <div className="text-blue-300 text-sm">🔮 你的角色信息</div>
                      <div className="text-white mt-1">
                        角色: <span className="font-bold text-yellow-400">{msg.content.role}</span>
                        <span className={`ml-2 ${msg.content.team === 'good' ? 'text-blue-400' : 'text-red-400'}`}>
                          ({msg.content.team === 'good' ? '好人阵营' : '坏人阵营'})
                        </span>
                      </div>
                      {msg.content.info && msg.content.info !== '无' && (
                        <div className="text-yellow-300 text-sm mt-1">
                          💡 {msg.content.info}
                        </div>
                      )}
                    </div>
                  );
                }
                
                if (msg.type === 'game_message') {
                  const source = msg.content?.source || msg.player_name || 'system';
                  // Ensure content is a string
                  let content = msg.content?.content;
                  if (typeof content !== 'string') {
                    content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                  }
                  
                  return (
                    <div key={index} className="bg-gray-700/50 rounded-lg p-3 fade-in">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getSourceEmoji(source)}</span>
                        <span className={`font-semibold ${getSourceColor(source)}`}>
                          {source}
                        </span>
                        {source === playerName && (
                          <span className="text-xs text-blue-400">(你)</span>
                        )}
                      </div>
                      <div className="text-gray-200 whitespace-pre-wrap">
                        {content}
                      </div>
                    </div>
                  );
                }
                
                if (msg.type === 'game_over') {
                  return (
                    <div key={index} className="bg-gradient-to-r from-yellow-900/50 to-orange-900/50 
                                                rounded-lg p-4 border border-yellow-500 fade-in">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-400 mb-2">🏆 游戏结束 🏆</div>
                        <div className="text-white">{msg.content.message}</div>
                        {msg.content.roles && (
                          <div className="mt-3">
                            <div className="text-sm text-gray-400 mb-2">角色揭晓:</div>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {Object.entries(msg.content.roles).map(([name, role]) => (
                                <span key={name} className="px-2 py-1 bg-gray-800 rounded text-sm text-white">
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
                    <div key={index} className="bg-red-900/30 rounded-lg p-3 border border-red-500 fade-in">
                      <span className="text-red-400">⚠️ 错误: {msg.content.message || msg.content}</span>
                    </div>
                  );
                }
                
                // Default message display
                return (
                  <div key={index} className="text-gray-400 text-sm fade-in">
                    [{msg.type}] {JSON.stringify(msg.content)}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Human player input area */}
          {waitingForInput && (
            <div className="mt-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/30 fade-in">
              <div className="text-blue-300 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
                等待你的输入 - {inputPrompt}
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendInput()}
                  placeholder="输入你的发言或决策..."
                  className="input flex-1"
                  autoFocus
                />
                <button
                  onClick={handleSendInput}
                  disabled={!inputText.trim()}
                  className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  发送
                </button>
              </div>
              <div className="text-slate-400 text-sm mt-3">
                💡 提示：投票时请使用格式 "我的投票是: 同意/反对" 或 "我的投票是: 成功/失败"
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game status footer */}
      <div className="mt-4 glass rounded-2xl p-4 fade-in flex-shrink-0" style={{ animationDelay: '0.2s' }}>
        <div className="text-center">
          {gameState?.is_running ? (
            waitingForInput ? (
              <span className="text-blue-400 animate-pulse flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
                等待你的输入...
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center justify-center gap-2">
                <span>🎮</span> 游戏进行中 - AI 玩家正在自动进行游戏
              </span>
            )
          ) : (
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <span className="text-amber-400 flex items-center gap-2">
                <span>🏁</span> 游戏已结束
              </span>
              <button
                onClick={handleRestartGame}
                className="btn btn-success"
              >
                <span>🔄</span> 重新开始
              </button>
              <button
                onClick={() => navigate('/')}
                className="btn btn-secondary"
              >
                返回首页
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fixed exit button at bottom-right corner - only for host */}
      {isHost && (
        <button
          onClick={handleEndGameClick}
          className="fixed bottom-6 right-6 btn btn-danger shadow-xl z-50"
        >
          <span>🎮</span> 结束本局
        </button>
      )}

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
