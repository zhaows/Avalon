"""
WebSocket connection manager.
"""
import json
from typing import Dict, List, Set
from fastapi import WebSocket
from datetime import datetime

from .logger import ws_logger as logger
from .models import GameMessage


class ConnectionManager:
    """Manages WebSocket connections for rooms."""
    
    def __init__(self):
        # room_id -> {player_id -> List[WebSocket]}  支持同一玩家多个连接（多标签页）
        self.connections: Dict[str, Dict[str, List[WebSocket]]] = {}
        # room_id -> {player_id -> WebSocket}  游戏页专用，单连接
        self.game_connections: Dict[str, Dict[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str, player_id: str):
        """Accept and register a WebSocket connection (supports multiple connections per player)."""
        await websocket.accept()
        
        if room_id not in self.connections:
            self.connections[room_id] = {}
        
        if player_id not in self.connections[room_id]:
            self.connections[room_id][player_id] = []
        
        self.connections[room_id][player_id].append(websocket)
        logger.debug(f"WS连接注册: room={room_id}, player={player_id}, 连接数={len(self.connections[room_id][player_id])}")
    
    async def connect_game(self, websocket: WebSocket, room_id: str, player_id: str):
        """
        Accept and register a game WebSocket connection.
        Game connections are exclusive - new connection kicks old one.
        """
        await websocket.accept()
        
        if room_id not in self.game_connections:
            self.game_connections[room_id] = {}
        
        # 如果已有游戏连接，踢掉旧连接
        old_ws = self.game_connections[room_id].get(player_id)
        if old_ws:
            try:
                await old_ws.close(code=4001, reason="您已在其他页面打开游戏")
            except Exception:
                pass
            logger.info(f"WS游戏连接踢出旧连接: room={room_id}, player={player_id}")
        
        self.game_connections[room_id][player_id] = websocket
        logger.debug(f"WS游戏连接注册: room={room_id}, player={player_id}")
    
    def disconnect(self, room_id: str, player_id: str, websocket: WebSocket = None):
        """Remove a WebSocket connection."""
        # 从普通连接中移除
        if room_id in self.connections and player_id in self.connections[room_id]:
            if websocket:
                # 只移除指定的 WebSocket
                try:
                    self.connections[room_id][player_id].remove(websocket)
                except ValueError:
                    pass
            else:
                # 移除所有连接
                self.connections[room_id][player_id] = []
            
            # 清理空列表
            if not self.connections[room_id][player_id]:
                del self.connections[room_id][player_id]
            
            logger.debug(f"WS连接移除: room={room_id}, player={player_id}")
            
            # Clean up empty rooms
            if not self.connections[room_id]:
                del self.connections[room_id]
                logger.debug(f"WS房间清理: room={room_id}")
    
    def disconnect_game(self, room_id: str, player_id: str, websocket: WebSocket = None):
        """Remove a game WebSocket connection."""
        if room_id in self.game_connections and player_id in self.game_connections[room_id]:
            # 只有当前连接是同一个对象时才移除（防止旧连接关闭时误删新连接）
            if websocket is None or self.game_connections[room_id][player_id] is websocket:
                del self.game_connections[room_id][player_id]
                logger.debug(f"WS游戏连接移除: room={room_id}, player={player_id}")
            
            # Clean up empty rooms
            if not self.game_connections[room_id]:
                del self.game_connections[room_id]
    
    async def send_to_player(self, room_id: str, player_id: str, message: dict):
        """Send a message to all connections of a specific player."""
        disconnected = []
        
        # 发送到普通连接
        if room_id in self.connections and player_id in self.connections[room_id]:
            for ws in self.connections[room_id][player_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    disconnected.append(ws)
            
            for ws in disconnected:
                self.disconnect(room_id, player_id, ws)
        
        # 发送到游戏连接
        if room_id in self.game_connections:
            ws = self.game_connections[room_id].get(player_id)
            if ws:
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect_game(room_id, player_id, ws)
    
    async def broadcast_to_room(self, room_id: str, message: dict, exclude: Set[str] = None):
        """Broadcast a message to all players in a room (both normal and game connections)."""
        exclude = exclude or set()
        
        # 广播到普通连接
        if room_id in self.connections:
            for player_id, ws_list in list(self.connections[room_id].items()):
                if player_id in exclude:
                    continue
                disconnected = []
                for ws in ws_list:
                    try:
                        await ws.send_json(message)
                    except Exception:
                        disconnected.append(ws)
                for ws in disconnected:
                    self.disconnect(room_id, player_id, ws)
        
        # 广播到游戏连接
        if room_id in self.game_connections:
            for player_id, ws in list(self.game_connections[room_id].items()):
                if player_id in exclude:
                    continue
                try:
                    await ws.send_json(message)
                except Exception:
                    self.disconnect_game(room_id, player_id, ws)
    
    def get_connected_players(self, room_id: str) -> List[str]:
        """Get list of connected player IDs in a room."""
        players = set()
        if room_id in self.connections:
            players.update(self.connections[room_id].keys())
        if room_id in self.game_connections:
            players.update(self.game_connections[room_id].keys())
        return list(players)


# Global connection manager instance
connection_manager = ConnectionManager()
