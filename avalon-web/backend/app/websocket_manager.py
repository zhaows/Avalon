"""
WebSocket connection manager.
"""
import json
from typing import Dict, List, Set
from fastapi import WebSocket
from datetime import datetime

from .models import GameMessage


class ConnectionManager:
    """Manages WebSocket connections for rooms."""
    
    def __init__(self):
        # room_id -> {player_id -> WebSocket}
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str, player_id: str):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        
        if room_id not in self.connections:
            self.connections[room_id] = {}
        
        self.connections[room_id][player_id] = websocket
    
    def disconnect(self, room_id: str, player_id: str):
        """Remove a WebSocket connection."""
        if room_id in self.connections:
            if player_id in self.connections[room_id]:
                del self.connections[room_id][player_id]
            
            # Clean up empty rooms
            if not self.connections[room_id]:
                del self.connections[room_id]
    
    async def send_to_player(self, room_id: str, player_id: str, message: dict):
        """Send a message to a specific player."""
        if room_id in self.connections:
            ws = self.connections[room_id].get(player_id)
            if ws:
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect(room_id, player_id)
    
    async def broadcast_to_room(self, room_id: str, message: dict, exclude: Set[str] = None):
        """Broadcast a message to all players in a room."""
        if room_id not in self.connections:
            return
        
        exclude = exclude or set()
        disconnected = []
        
        for player_id, ws in self.connections[room_id].items():
            if player_id in exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(player_id)
        
        # Clean up disconnected
        for player_id in disconnected:
            self.disconnect(room_id, player_id)
    
    def get_connected_players(self, room_id: str) -> List[str]:
        """Get list of connected player IDs in a room."""
        if room_id in self.connections:
            return list(self.connections[room_id].keys())
        return []


# Global connection manager instance
connection_manager = ConnectionManager()
