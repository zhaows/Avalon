"""
Room manager for handling game rooms.
"""
import uuid
from typing import Dict, List, Optional
from datetime import datetime

from .models import RoomInfo, PlayerInfo, PlayerType, GameState, AI_DISPLAY_NAMES


class RoomManager:
    """Manages game rooms."""
    
    def __init__(self):
        self.rooms: Dict[str, RoomInfo] = {}
    
    def create_room(self, room_name: str, host_name: str) -> tuple[RoomInfo, PlayerInfo]:
        """Create a new room and add the host as first player."""
        room_id = str(uuid.uuid4())[:8]
        player_id = str(uuid.uuid4())[:8]
        
        host = PlayerInfo(
            id=player_id,
            name=host_name,
            player_type=PlayerType.HUMAN,
            seat=1
        )
        
        room = RoomInfo(
            id=room_id,
            name=room_name,
            host_id=player_id,
            players=[host],
            game_state=GameState()
        )
        
        self.rooms[room_id] = room
        return room, host
    
    def get_room(self, room_id: str) -> Optional[RoomInfo]:
        """Get room by ID."""
        return self.rooms.get(room_id)
    
    def list_rooms(self) -> List[RoomInfo]:
        """List all available rooms."""
        return list(self.rooms.values())
    
    def join_room(self, room_id: str, player_name: str, player_type: PlayerType = PlayerType.HUMAN) -> Optional[PlayerInfo]:
        """Add a player to a room."""
        room = self.get_room(room_id)
        if not room or len(room.players) >= room.max_players:
            return None
        
        # Check for duplicate name
        existing_names = [p.name for p in room.players]
        if player_name in existing_names:
            player_name = f"{player_name}_{len(room.players) + 1}"
        
        player_id = str(uuid.uuid4())[:8]
        seat = len(room.players) + 1
        
        player = PlayerInfo(
            id=player_id,
            name=player_name,
            player_type=player_type,
            seat=seat
        )
        
        room.players.append(player)
        return player
    
    def add_ai_players(self, room_id: str, count: int = 1, names: List[str] = None) -> List[PlayerInfo]:
        """
        Add AI players to fill empty slots.
        names: 可选的AI玩家名字列表，不提供则使用默认中文昵称
        """
        room = self.get_room(room_id)
        if not room:
            return []
        
        added = []
        
        for i in range(count):
            if len(room.players) >= room.max_players:
                break
            
            # 确定AI名字: 优先使用用户提供的名字，否则使用默认中文昵称
            used_names = [p.name for p in room.players]
            ai_name = None
            
            # 如果用户提供了名字列表，使用对应索引的名字
            if names and i < len(names) and names[i]:
                ai_name = names[i]
                # 检查重复名
                if ai_name in used_names:
                    ai_name = f"{ai_name}_{len(room.players) + 1}"
            else:
                # 使用默认的中文昵称
                for name in AI_DISPLAY_NAMES:
                    if name not in used_names:
                        ai_name = name
                        break
                
                if not ai_name:
                    ai_name = f"玩家{len(room.players) + 1}"
            
            player = self.join_room(room_id, ai_name, PlayerType.AI)
            if player:
                added.append(player)
        
        return added
    
    def leave_room(self, room_id: str, player_id: str) -> dict:
        """
        Remove a player from a room.
        Returns: {
            'success': bool,
            'room_deleted': bool,
            'new_host_id': str | None,
            'new_host_name': str | None
        }
        """
        room = self.get_room(room_id)
        if not room:
            return {'success': False, 'room_deleted': False, 'new_host_id': None, 'new_host_name': None}
        
        leaving_player = self.get_player_in_room(room_id, player_id)
        was_host = room.host_id == player_id
        
        room.players = [p for p in room.players if p.id != player_id]
        
        # Reassign seats
        for i, player in enumerate(room.players):
            player.seat = i + 1
        
        result = {
            'success': True,
            'room_deleted': False,
            'new_host_id': None,
            'new_host_name': None
        }
        
        # Check remaining human players
        human_players = [p for p in room.players if p.player_type == PlayerType.HUMAN]
        
        if len(room.players) == 0:
            # No players left, delete room
            del self.rooms[room_id]
            result['room_deleted'] = True
        elif len(human_players) == 0:
            # No human players left, delete room
            del self.rooms[room_id]
            result['room_deleted'] = True
        elif was_host:
            # Transfer host to another human player
            new_host = human_players[0]
            room.host_id = new_host.id
            result['new_host_id'] = new_host.id
            result['new_host_name'] = new_host.name
        
        return result
    
    def delete_room(self, room_id: str) -> bool:
        """Delete a room."""
        if room_id in self.rooms:
            del self.rooms[room_id]
            return True
        return False
    
    def get_player_in_room(self, room_id: str, player_id: str) -> Optional[PlayerInfo]:
        """Get a player in a specific room."""
        room = self.get_room(room_id)
        if not room:
            return None
        
        for player in room.players:
            if player.id == player_id:
                return player
        return None


# Global room manager instance
room_manager = RoomManager()
