/**
 * Zustand store for game state management.
 */
import { create } from 'zustand';
import { GameState, GameMessage, Room } from '../types';
import { toast } from './toastStore';
import { HostGameState } from '../components/GameStatusPanel';

interface GameStore {
  // Connection state
  roomId: string | null;
  playerId: string | null;
  playerName: string | null;
  
  // Room state
  room: Room | null;
  
  // Game state
  gameState: GameState | null;
  hostGameState: HostGameState | null;  // Host输出的详细游戏状态
  messages: GameMessage[];
  
  // WebSocket
  ws: WebSocket | null;
  isConnected: boolean;
  
  // Actions
  setConnection: (roomId: string, playerId: string, playerName: string) => void;
  setRoom: (room: Room) => void;
  setGameState: (state: GameState) => void;
  setHostGameState: (state: HostGameState | null) => void;
  addMessage: (message: GameMessage) => void;
  clearMessages: () => void;
  
  // WebSocket actions
  connect: (isGamePage?: boolean) => void;  // isGamePage=true 使用专用游戏连接
  disconnect: () => void;
  sendMessage: (message: any) => void;
  handleMessage: (data: any) => void;
  
  // Reset
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  roomId: null,
  playerId: null,
  playerName: null,
  room: null,
  gameState: null,
  hostGameState: null,
  messages: [],
  ws: null,
  isConnected: false,

  setConnection: (roomId, playerId, playerName) => {
    set({ roomId, playerId, playerName });
    // Save to session storage
    sessionStorage.setItem('avalon_room_id', roomId);
    sessionStorage.setItem('avalon_player_id', playerId);
    sessionStorage.setItem('avalon_player_name', playerName);
  },

  setRoom: (room) => set({ room }),

  setGameState: (gameState) => set({ gameState }),

  setHostGameState: (hostGameState) => set({ hostGameState }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  clearMessages: () => set({ messages: [] }),

  connect: (isGamePage = false) => {
    const { roomId, playerId, ws: existingWs } = get();
    if (!roomId || !playerId) return;
    
    // Don't create duplicate connections - check both OPEN and CONNECTING states
    if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected or connecting');
      return;
    }
    
    // Close any existing connection that's closing or closed
    if (existingWs) {
      try {
        existingWs.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // In development, connect directly to backend; in production, use same host
    // For reverse proxy, WebSocket should go through the same host
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 游戏页使用专用路径 /ws/game/，其他页面使用普通路径 /ws/
    const wsPath = isGamePage ? `/ws/game/${roomId}/${playerId}` : `/ws/${roomId}/${playerId}`;
    const wsUrl = `${protocol}//${wsHost}${wsPath}`;
    
    console.log('Connecting to WebSocket:', wsUrl, isGamePage ? '(game page)' : '(room page)');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ isConnected: true, ws });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket received message:', data.type, data);
      get().handleMessage(data);
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
      set({ isConnected: false, ws: null });
      
      // 处理被踢出的情况（游戏页专用连接被新连接踢掉）
      if (event.code === 4001) {
        // 导入 toast 会有循环依赖，这里使用自定义事件通知
        window.dispatchEvent(new CustomEvent('ws-kicked', { 
          detail: { reason: event.reason || '您已在其他页面打开游戏' }
        }));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    set({ ws });

    // Ping to keep alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    // Clean up on close
    ws.addEventListener('close', () => clearInterval(pingInterval));
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false });
    }
  },

  sendMessage: (message: any) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected, cannot send message');
    }
  },

  handleMessage: (data) => {
    const { type } = data;

    // Message types to display in the game log
    const displayTypes = [
      'game_message',      // AI agent messages from Swarm stream
      'game_start',        // Game started notification
      'role_assigned',     // Role assignment to player
      'game_over',         // Game ended
      'waiting_input',     // Waiting for human player input
      'error',             // Error messages
    ];

    // Add to messages list for game log display
    if (displayTypes.includes(type)) {
      get().addMessage(data as GameMessage);
    }

    // Handle specific message types
    switch (type) {
      case 'game_state_update':
        // Update game state from Host's structured output
        console.log('Game state update:', data.content);
        if (data.content) {
          const stateUpdate = data.content;
          // 更新 hostGameState 用于显示详细状态
          set({
            hostGameState: {
              phase: stateUpdate.phase,
              mission_round: stateUpdate.mission_round,
              captain: stateUpdate.captain,
              team_members: stateUpdate.team_members,
              mission_success_count: stateUpdate.mission_success_count || 0,
              mission_fail_count: stateUpdate.mission_fail_count || 0,
              reject_count: stateUpdate.reject_count || 0,
              next_player: stateUpdate.next_player,
            }
          });
          // 同时更新 gameState 中的相关字段
          const currentState = get().gameState;
          if (currentState) {
            set({
              gameState: {
                ...currentState,
                phase: stateUpdate.phase || currentState.phase,
                current_mission: stateUpdate.mission_round || currentState.current_mission,
                vote_reject_count: stateUpdate.reject_count ?? currentState.vote_reject_count,
                mission_results: [
                  ...Array(stateUpdate.mission_success_count || 0).fill(true),
                  ...Array(stateUpdate.mission_fail_count || 0).fill(false),
                ].slice(0, 5),
              }
            });
          }
        }
        break;

      case 'player_joined':
      case 'player_left':
      case 'player_online':
      case 'player_offline':
        // Room state refresh handled by component
        break;

      case 'host_changed':
        console.log('Host changed:', data.new_host_name);
        // Room state will be refreshed by component
        break;

      case 'room_closed':
        console.log('Room closed:', data.message);
        // Show toast notification and navigate to home
        toast.warning('房间已关闭', data.message || '房间已解散');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
        break;

      case 'game_stopped':
        console.log('Game stopped:', data.message);
        // Clear messages - navigation handled by GamePage
        set({ messages: [] });
        break;

      case 'game_start':
        console.log('Game started!');
        break;

      case 'game_message':
        // Log for debugging
        console.log('Game message:', data.content);
        break;

      case 'role_assigned':
        console.log('Role assigned:', data.content);
        break;

      case 'waiting_input':
        console.log('Waiting for input from:', data.player_name);
        break;

      case 'input_received':
        console.log('Input received:', data.success);
        break;

      case 'game_over':
        console.log('Game over:', data.content);
        break;

      case 'game_restart':
        console.log('Game restarted');
        // Clear messages and host state for new game
        set({ hostGameState: null });
        get().clearMessages();
        break;

      case 'pong':
        // Ignore ping response
        break;

      default:
        console.log('Received message:', type, data);
    }
  },

  reset: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
    }
    sessionStorage.removeItem('avalon_room_id');
    sessionStorage.removeItem('avalon_player_id');
    sessionStorage.removeItem('avalon_player_name');
    set({
      roomId: null,
      playerId: null,
      playerName: null,
      room: null,
      gameState: null,
      hostGameState: null,
      messages: [],
      ws: null,
      isConnected: false,
    });
  },
}));

// Initialize from session storage
const savedRoomId = sessionStorage.getItem('avalon_room_id');
const savedPlayerId = sessionStorage.getItem('avalon_player_id');
const savedPlayerName = sessionStorage.getItem('avalon_player_name');

if (savedRoomId && savedPlayerId && savedPlayerName) {
  useGameStore.getState().setConnection(savedRoomId, savedPlayerId, savedPlayerName);
}
