"""
Room manager for handling game rooms.
"""
import uuid
import random
from typing import Dict, List, Optional
from datetime import datetime

from .models import RoomInfo, PlayerInfo, PlayerType, GameState, AI_DISPLAY_NAMES
from .logger import room_logger as logger

# AI玩家人设列表（与game_engine保持一致）
AI_PERSONALITY_LIST = [
    "沉稳冷静，善于分析，发言简洁有力",
    "热情活跃，喜欢带动气氛，善于引导话题",
    "谨慎多疑，喜欢质疑他人，观察力强",
    "直来直去，说话直接，不喜欢绕弯子",
    "幽默风趣，喜欢用轻松的方式表达观点",
    "沉默寡言，只在关键时刻发表意见",
    "老谋深算，喜欢设置陷阱试探他人",
    "情绪化，容易被他人发言影响",
    "自信满满，喜欢主导讨论方向",
    "圆滑世故，善于调和各方矛盾"
]


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
        logger.info(f"创建房间: room_id={room_id}, room_name={room_name}, host={host_name}({player_id})")
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
        logger.info(f"玩家加入: room_id={room_id}, player={player_name}({player_id}), type={player_type.value}, seat={seat}")
        return player
    
    def add_ai_players(self, room_id: str, count: int = 1, names: List[str] = None, 
                        players: List[dict] = None) -> List[PlayerInfo]:
        """
        Add AI players to fill empty slots.
        names: 可选的AI玩家名字列表，不提供则使用默认中文昵称
        players: 完整的AI玩家信息列表 [{"name": "...", "personality": "..."}]
        """
        room = self.get_room(room_id)
        if not room:
            return []
        
        added = []
        
        # 如果提供了完整的players列表，使用它
        if players:
            count = len(players)
        
        for i in range(count):
            if len(room.players) >= room.max_players:
                break
            
            # 确定AI名字和人设
            used_names = [p.name for p in room.players]
            ai_name = None
            ai_personality = None
            
            # 优先使用players列表
            if players and i < len(players):
                player_info = players[i]
                ai_name = player_info.get('name')
                ai_personality = player_info.get('personality')
                # 检查重复名
                if ai_name and ai_name in used_names:
                    ai_name = f"{ai_name}_{len(room.players) + 1}"
            # 其次使用names列表
            elif names and i < len(names) and names[i]:
                ai_name = names[i]
                # 检查重复名
                if ai_name in used_names:
                    ai_name = f"{ai_name}_{len(room.players) + 1}"
            
            # 如果没有名字，使用默认中文昵称
            if not ai_name:
                for name in AI_DISPLAY_NAMES:
                    if name not in used_names:
                        ai_name = name
                        break
                if not ai_name:
                    ai_name = f"玩家{len(room.players) + 1}"
            
            player = self.join_room(room_id, ai_name, PlayerType.AI)
            if player:
                # 如果提供了人设则使用，否则随机分配
                if ai_personality:
                    player.personality = ai_personality
                else:
                    player.personality = random.choice(AI_PERSONALITY_LIST)
                logger.debug(f"AI玩家人设: {player.name} -> {player.personality[:10]}...")
                added.append(player)
        
        logger.info(f"添加AI玩家: room_id={room_id}, count={len(added)}, names={[p.name for p in added]}")
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
            logger.warning(f"离开房间失败: room_id={room_id} 不存在")
            return {'success': False, 'room_deleted': False, 'new_host_id': None, 'new_host_name': None}
        
        leaving_player = self.get_player_in_room(room_id, player_id)
        was_host = room.host_id == player_id
        player_name = leaving_player.name if leaving_player else "unknown"
        
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
            logger.info(f"房间删除: room_id={room_id} (无玩家)")
        elif len(human_players) == 0:
            # No human players left, delete room
            del self.rooms[room_id]
            result['room_deleted'] = True
            logger.info(f"房间删除: room_id={room_id} (无人类玩家)")
        elif was_host:
            # Transfer host to another human player
            new_host = human_players[0]
            room.host_id = new_host.id
            result['new_host_id'] = new_host.id
            result['new_host_name'] = new_host.name
            logger.info(f"房主转移: room_id={room_id}, new_host={new_host.name}({new_host.id})")
        
        logger.info(f"玩家离开: room_id={room_id}, player={player_name}({player_id}), was_host={was_host}")
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
