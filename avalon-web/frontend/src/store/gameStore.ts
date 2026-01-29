/**
 * Zustand store for game state management.
 */
import { create } from 'zustand';
import { GameState, GameMessage, Room } from '../types';
import { toast } from './toastStore';

interface GameStore {
  // Connection state
  roomId: string | null;
  playerId: string | null;
  playerName: string | null;
  
  // Room state
  room: Room | null;
  
  // Game state
  gameState: GameState | null;
  messages: GameMessage[];
  
  // WebSocket
  ws: WebSocket | null;
  isConnected: boolean;
  
  // Actions
  setConnection: (roomId: string, playerId: string, playerName: string) => void;
  setRoom: (room: Room) => void;
  setGameState: (state: GameState) => void;
  addMessage: (message: GameMessage) => void;
  clearMessages: () => void;
  
  // WebSocket actions
  connect: () => void;
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

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  clearMessages: () => set({ messages: [] }),

  connect: () => {
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
    const wsUrl = `${protocol}//${wsHost}/ws/${roomId}/${playerId}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
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

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ isConnected: false, ws: null });
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
        // Clear messages for new game
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
