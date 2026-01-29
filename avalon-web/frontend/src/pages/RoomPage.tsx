/**
 * Room page - Waiting room before game starts.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { roomApi, gameApi } from '../api';
import { useGameStore } from '../store/gameStore';
import { Room, Player } from '../types';

export default function RoomPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const { playerId, playerName, setRoom, connect, disconnect, isConnected, messages } = useGameStore();
  
  const [room, setRoomData] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAI = async (count: number) => {
    if (!roomId) return;
    
    try {
      await roomApi.addAI(roomId, count);
      await loadRoom();
    } catch (err: any) {
      setError(err.message);
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
    
    setStarting(true);
    try {
      await gameApi.start(roomId, playerId);
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
              </div>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="btn btn-danger"
            >
              <span>🚪</span> 离开房间
            </button>
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
                  onClick={() => handleAddAI(1)}
                  disabled={room.players.length >= 7}
                  className="btn bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>🤖</span> 添加AI
                </button>
                
                {emptySlots > 1 && (
                  <button
                    onClick={() => handleAddAI(emptySlots)}
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
    </div>
  );
}
