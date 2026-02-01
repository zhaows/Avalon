/**
 * API client for Avalon backend.
 */

const API_BASE = '/api';

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
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Room APIs
export const roomApi = {
  list: () => 
    request<{ rooms: any[] }>('/rooms'),

  create: (roomName: string, playerName: string) =>
    request<{ room_id: string; player_id: string; player_name: string }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ room_name: roomName, player_name: playerName }),
    }),

  get: (roomId: string) =>
    request<any>(`/rooms/${roomId}`),

  join: (roomId: string, playerName: string) =>
    request<{ player_id: string; player_name: string; seat: number }>(
      `/rooms/${roomId}/join`,
      {
        method: 'POST',
        body: JSON.stringify({ player_name: playerName }),
      }
    ),

  addAI: (roomId: string, count: number = 1, names?: string[]) =>
    request<{ added: any[]; total_players: number }>(
      `/rooms/${roomId}/ai`,
      {
        method: 'POST',
        body: JSON.stringify({ count, names }),
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
};

// Game APIs
export const gameApi = {
  // Start the game - this triggers Swarm team.run_stream()
  start: (roomId: string, playerId: string) =>
    request<{ success: boolean; message: string }>(
      `/rooms/${roomId}/start?player_id=${playerId}`,
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
