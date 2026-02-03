/**
 * Home page - Room list and creation.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomApi } from '../api';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { RoomListItem } from '../types';
import UserInfoPanel from '../components/UserInfoPanel';
import { useAuth } from '../utils/auth';

export default function HomePage() {
  const navigate = useNavigate();
  const { setConnection, reset } = useGameStore();
  const { isLoggedIn, user, token } = useAuthStore();
  const { requireAuth } = useAuth();
  
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState<string | null>(null);
  
  const [roomName, setRoomName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    reset(); // Clear any previous session
    loadRooms();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // 自动填充玩家名为登录用户名
  useEffect(() => {
    if (isLoggedIn && user?.display_name && !playerName) {
      setPlayerName(user.display_name);
    }
  }, [isLoggedIn, user]);

  const loadRooms = async () => {
    try {
      const data = await roomApi.list();
      setRooms(data.rooms);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim() || !playerName.trim()) {
      setError('请填写房间名和玩家名');
      return;
    }

    // 检查登录状态
    if (!requireAuth()) return;

    try {
      const result = await roomApi.create(roomName.trim(), playerName.trim(), token);
      setConnection(result.room_id, result.player_id, result.player_name);
      navigate(`/room/${result.room_id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!playerName.trim()) {
      setError('请填写玩家名');
      return;
    }

    // 检查登录状态
    if (!requireAuth()) return;

    try {
      const result = await roomApi.join(roomId, playerName.trim(), token);
      setConnection(roomId, result.player_id, result.player_name);
      navigate(`/room/${roomId}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar - User Info */}
      <div className="absolute top-4 right-4 z-10">
        <UserInfoPanel compact />
      </div>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl"></div>
        
        {/* Logo and Title */}
        <div className="text-center mb-12 fade-in">
          <div className="text-7xl mb-4 animate-float">⚔️</div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <span className="gradient-text">阿瓦隆</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-md mx-auto">
            经典7人阵营推理桌游，支持 AI 玩家
          </p>
          {!isLoggedIn && (
            <p className="text-green-400 text-sm mt-2">
              🎁 新用户注册赠送 20 人次 AI 玩家额度
            </p>
          )}
        </div>

        {/* Main Actions */}
        <div className="w-full max-w-md space-y-4 fade-in" style={{ animationDelay: '0.1s' }}>
          {isLoggedIn ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-4 px-6 btn-primary text-lg font-semibold rounded-2xl 
                         transform hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span className="text-xl">🎮</span>
              创建新房间
            </button>
          ) : (
            <button
              onClick={() => requireAuth({ silent: true })}
              className="w-full py-4 px-6 btn-primary text-lg font-semibold rounded-2xl 
                         transform hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span className="text-xl">🔐</span>
              登录开始游戏
            </button>
          )}
        </div>

        {/* Room List */}
        <div className="w-full max-w-2xl mt-12 fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🏠</span> 房间列表
              </h2>
              <span className="text-sm text-slate-400">
                {rooms.length} 个房间
              </span>
            </div>
            
            {loading ? (
              <div className="flex flex-col items-center py-12">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-slate-400">加载中...</span>
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4 opacity-50">🎲</div>
                <p className="text-slate-400">暂无房间</p>
                <p className="text-slate-500 text-sm mt-1">创建一个新房间开始游戏吧！</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="group p-4 bg-slate-800/50 rounded-xl border border-slate-700/50
                               hover:border-slate-600 hover:bg-slate-800 transition-all duration-200
                               card-hover"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl
                          ${room.phase === 'waiting' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {room.phase === 'waiting' ? '🎯' : '⚔️'}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors">
                            {room.name}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <span>👥</span> {room.player_count}/{room.max_players}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                              ${room.phase === 'waiting' 
                                ? 'bg-emerald-500/20 text-emerald-400' 
                                : 'bg-amber-500/20 text-amber-400'}`}>
                              {room.phase === 'waiting' ? '等待中' : '游戏中'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {room.phase === 'waiting' && room.player_count < room.max_players && (
                        <button
                          onClick={() => {
                            if (isLoggedIn) {
                              setShowJoin(room.id);
                            } else {
                              requireAuth({ silent: true });
                            }
                          }}
                          className="btn-success px-5 py-2 rounded-xl opacity-80 group-hover:opacity-100 transition-opacity"
                        >
                          加入
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-slate-500 text-sm">
          Powered by <span className="text-slate-400">FutureAI</span>
        </p>
      </footer>

      {/* Create Room Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-dark rounded-2xl p-8 w-full max-w-md animate-scale-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-2xl">
                🎮
              </div>
              <h2 className="text-2xl font-bold text-white">创建房间</h2>
            </div>
            
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-5">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">房间名称</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="给房间起个名字"
                  className="input"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">你的昵称</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="输入你的游戏昵称"
                  className="input"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setError('');
                }}
                className="flex-1 btn btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateRoom}
                className="flex-1 btn btn-primary"
              >
                创建房间
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-dark rounded-2xl p-8 w-full max-w-md animate-scale-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-2xl">
                🚀
              </div>
              <h2 className="text-2xl font-bold text-white">加入房间</h2>
            </div>
            
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">你的昵称</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="输入你的游戏昵称"
                className="input"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => {
                  setShowJoin(null);
                  setError('');
                }}
                className="flex-1 btn btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => handleJoinRoom(showJoin)}
                className="flex-1 btn btn-success"
              >
                加入游戏
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
