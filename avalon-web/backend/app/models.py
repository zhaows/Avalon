"""
Data models for the Avalon game.
"""
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from dataclasses import dataclass, field
import uuid
from datetime import datetime


class Role(str, Enum):
    """Character roles in the game."""
    MERLIN = "梅林"
    PERCIVAL = "派西维尔"
    LOYAL_SERVANT = "忠臣"
    ASSASSIN = "刺客"
    MORGANA = "莫甘娜"
    OBERON = "奥伯伦"


class Team(str, Enum):
    """Team affiliations."""
    GOOD = "good"
    EVIL = "evil"


class GamePhase(str, Enum):
    """Game phases/states."""
    WAITING = "waiting"          # Waiting for players
    ROLE_ASSIGN = "role_assign"  # Assigning roles
    TEAM_SELECT = "team_select"  # Captain selects team
    SPEAKING = "speaking"        # Players speak in order
    VOTING = "voting"            # Vote on team
    MISSION = "mission"          # Execute mission
    ASSASSINATE = "assassinate"  # Assassin kills Merlin
    GAME_OVER = "game_over"      # Game ended


class PlayerType(str, Enum):
    """Type of player."""
    HUMAN = "human"
    AI = "ai"


# Role configurations
ROLE_INFO = {
    Role.MERLIN: {
        "team": Team.GOOD,
        "personality": "聪明且谨慎, 发言时注意迷惑对方阵营, 不要暴露出你是梅林",
        "role_notes": "隐藏身份，避免被刺杀"
    },
    Role.PERCIVAL: {
        "team": Team.GOOD,
        "personality": "机智且善于观察, 注意保护梅林",
        "role_notes": "识别真假梅林，保护真正的梅林"
    },
    Role.LOYAL_SERVANT: {
        "team": Team.GOOD,
        "personality": "忠诚且勇敢",
        "role_notes": "无"
    },
    Role.ASSASSIN: {
        "team": Team.EVIL,
        "personality": "狡猾且有野心",
        "role_notes": "在游戏结束时刺杀梅林以帮助坏人阵营获胜"
    },
    Role.MORGANA: {
        "team": Team.EVIL,
        "personality": "狡诈且富有魅力",
        "role_notes": "伪装成梅林，误导派西维尔"
    },
    Role.OBERON: {
        "team": Team.EVIL,
        "personality": "孤独且神秘",
        "role_notes": "孤立坏人，无法与其他坏人互认，需自行辨识队友"
    }
}

# 7-player mission configuration
MISSION_CONFIG = {
    1: {"team_size": 2, "fails_required": 1},
    2: {"team_size": 3, "fails_required": 1},
    3: {"team_size": 3, "fails_required": 1},
    4: {"team_size": 4, "fails_required": 2},  # Special: needs 2 fails
    5: {"team_size": 4, "fails_required": 1},
}

# Role distribution for 7 players
SEVEN_PLAYER_ROLES = [
    Role.MERLIN,
    Role.PERCIVAL,
    Role.LOYAL_SERVANT,
    Role.LOYAL_SERVANT,
    Role.ASSASSIN,
    Role.MORGANA,
    Role.OBERON,
]


class PlayerInfo(BaseModel):
    """Information about a player."""
    id: str
    name: str
    player_type: PlayerType
    seat: int  # 1-7
    role: Optional[Role] = None
    is_captain: bool = False
    is_on_mission: bool = False
    is_online: bool = True


class GameState(BaseModel):
    """Current state of the game."""
    phase: GamePhase = GamePhase.WAITING
    current_mission: int = 1
    mission_results: List[bool] = []  # True = success, False = fail
    captain_seat: int = 1
    current_team: List[str] = []  # Player IDs on mission
    speaking_order: List[str] = []  # Player IDs in speaking order
    current_speaker_index: int = 0
    vote_reject_count: int = 0  # Consecutive vote rejections
    votes: Dict[str, bool] = {}  # Player ID -> approve/reject
    mission_votes: Dict[str, bool] = {}  # Player ID -> success/fail
    messages: List[Dict[str, Any]] = []  # Chat history
    winner: Optional[Team] = None


class RoomInfo(BaseModel):
    """Information about a game room."""
    id: str
    name: str
    host_id: str
    players: List[PlayerInfo] = []
    max_players: int = 7
    game_state: GameState = GameState()
    created_at: datetime = datetime.now()


# Request/Response models
class CreateRoomRequest(BaseModel):
    """Request to create a room."""
    room_name: str
    player_name: str


class JoinRoomRequest(BaseModel):
    """Request to join a room."""
    player_name: str
    player_type: PlayerType = PlayerType.HUMAN


class AddAIRequest(BaseModel):
    """Request to add AI players."""
    count: int = 1


class SelectTeamRequest(BaseModel):
    """Request to select team members."""
    player_ids: List[str]


class VoteRequest(BaseModel):
    """Request to vote."""
    approve: bool


class MissionVoteRequest(BaseModel):
    """Request to vote on mission."""
    success: bool


class AssassinateRequest(BaseModel):
    """Request to assassinate a player."""
    target_id: str


class SpeakRequest(BaseModel):
    """Request to speak."""
    message: str


class GameMessage(BaseModel):
    """A message in the game."""
    type: str
    player_id: Optional[str] = None
    player_name: Optional[str] = None
    content: Any
    timestamp: datetime = datetime.now()
