"""
FastAPI main application - Avalon Web Game Server.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
from datetime import datetime

from .models import (
    CreateRoomRequest, JoinRoomRequest, AddAIRequest,
    GamePhase, GameMessage, PlayerType, GameState
)
from .room_manager import room_manager
from .websocket_manager import connection_manager
from .game_engine import GameEngine


# Store active game engines
game_engines: Dict[str, GameEngine] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    print("🎮 Avalon Web Server starting...")
    yield
    print("🎮 Avalon Web Server shutting down...")


app = FastAPI(
    title="Avalon Web Game",
    description="阿瓦隆桌游网页版 - 支持AI与人类混合对战",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Room API ====================

@app.get("/api/rooms")
async def list_rooms():
    """List all available rooms."""
    rooms = room_manager.list_rooms()
    return {
        "rooms": [
            {
                "id": r.id,
                "name": r.name,
                "player_count": len(r.players),
                "max_players": r.max_players,
                "phase": r.game_state.phase.value
            }
            for r in rooms
        ]
    }


@app.post("/api/rooms")
async def create_room(request: CreateRoomRequest):
    """Create a new game room."""
    room, host = room_manager.create_room(request.room_name, request.player_name)
    return {
        "room_id": room.id,
        "player_id": host.id,
        "player_name": host.name
    }


@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    """Get room details."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    return {
        "id": room.id,
        "name": room.name,
        "host_id": room.host_id,
        "phase": room.game_state.phase.value,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "seat": p.seat,
                "player_type": p.player_type.value,
                "is_captain": p.is_captain,
                "is_online": p.is_online
            }
            for p in room.players
        ]
    }


@app.post("/api/rooms/{room_id}/join")
async def join_room(room_id: str, request: JoinRoomRequest):
    """Join an existing room."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.game_state.phase != GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="游戏已开始，无法加入")
    
    player = room_manager.join_room(room_id, request.player_name, request.player_type)
    if not player:
        raise HTTPException(status_code=400, detail="房间已满")
    
    # Notify other players
    await connection_manager.broadcast_to_room(room_id, {
        "type": "player_joined",
        "player": {
            "id": player.id,
            "name": player.name,
            "seat": player.seat,
            "player_type": player.player_type.value
        }
    })
    
    return {
        "player_id": player.id,
        "player_name": player.name,
        "seat": player.seat
    }


@app.post("/api/rooms/{room_id}/ai")
async def add_ai_players(room_id: str, request: AddAIRequest):
    """Add AI players to the room."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.game_state.phase != GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="游戏已开始，无法添加玩家")
    
    added = room_manager.add_ai_players(room_id, request.count)
    
    # Notify other players
    for player in added:
        await connection_manager.broadcast_to_room(room_id, {
            "type": "player_joined",
            "player": {
                "id": player.id,
                "name": player.name,
                "seat": player.seat,
                "player_type": player.player_type.value
            }
        })
    
    return {
        "added": [{"id": p.id, "name": p.name} for p in added],
        "total_players": len(room.players)
    }


@app.delete("/api/rooms/{room_id}/ai/{ai_player_id}")
async def remove_ai_player(room_id: str, ai_player_id: str, player_id: str):
    """Remove an AI player from the room (host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.host_id != player_id:
        raise HTTPException(status_code=403, detail="只有房主可以移除AI玩家")
    
    if room.game_state.phase != GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="游戏进行中无法移除玩家")
    
    ai_player = room_manager.get_player_in_room(room_id, ai_player_id)
    if not ai_player:
        raise HTTPException(status_code=404, detail="玩家不存在")
    
    if ai_player.player_type != PlayerType.AI:
        raise HTTPException(status_code=400, detail="只能移除AI玩家")
    
    ai_name = ai_player.name
    
    # Remove AI player
    room.players = [p for p in room.players if p.id != ai_player_id]
    
    # Reassign seats
    for i, p in enumerate(room.players):
        p.seat = i + 1
    
    # Notify other players
    await connection_manager.broadcast_to_room(room_id, {
        "type": "player_left",
        "player_id": ai_player_id,
        "player_name": ai_name
    })
    
    return {"success": True, "message": f"AI玩家 {ai_name} 已移除"}


@app.post("/api/rooms/{room_id}/leave")
async def leave_room(room_id: str, player_id: str):
    """Leave a room."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    player = room_manager.get_player_in_room(room_id, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="玩家不在房间中")
    
    player_name = player.name
    was_game_running = room.game_state.phase != GamePhase.WAITING
    
    # If game is running, stop it first and reset room state
    if was_game_running:
        # Stop game engine
        if room_id in game_engines:
            game_engines[room_id].is_running = False
            del game_engines[room_id]
        
        # Reset game state
        room.game_state = GameState()
        
        # Notify all players that game was stopped
        await connection_manager.broadcast_to_room(room_id, {
            "type": "game_stopped",
            "message": f"玩家 {player_name} 离开，游戏已停止",
            "player_name": player_name
        })
    
    result = room_manager.leave_room(room_id, player_id)
    
    if result['room_deleted']:
        # Room was deleted (no human players left)
        # Notify all connected players that room is closed
        await connection_manager.broadcast_to_room(room_id, {
            "type": "room_closed",
            "message": "房间已解散（没有人类玩家）"
        })
    else:
        # Notify other players about the player leaving
        await connection_manager.broadcast_to_room(room_id, {
            "type": "player_left",
            "player_id": player_id,
            "player_name": player_name
        })
        
        # If host changed, notify everyone
        if result['new_host_id']:
            await connection_manager.broadcast_to_room(room_id, {
                "type": "host_changed",
                "new_host_id": result['new_host_id'],
                "new_host_name": result['new_host_name'],
                "message": f"{result['new_host_name']} 成为新房主"
            })
    
    return {
        "success": True,
        "room_deleted": result['room_deleted'],
        "game_stopped": was_game_running
    }


# ==================== Game API ====================

@app.post("/api/rooms/{room_id}/stop")
async def stop_game(room_id: str, player_id: str):
    """Stop the current game but keep all players in the room (host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.host_id != player_id:
        raise HTTPException(status_code=403, detail="只有房主可以停止游戏")
    
    if room.game_state.phase == GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="游戏尚未开始")
    
    player = room_manager.get_player_in_room(room_id, player_id)
    player_name = player.name if player else "房主"
    
    # Stop game engine
    if room_id in game_engines:
        game_engines[room_id].is_running = False
        del game_engines[room_id]
    
    # Reset game state but keep all players
    room.game_state = GameState()
    
    # Notify all players that game was stopped
    await connection_manager.broadcast_to_room(room_id, {
        "type": "game_stopped",
        "message": "🎮 房主结束了本局游戏，返回房间准备新的一局",
        "player_name": player_name
    })
    
    return {"success": True, "message": "游戏已结束"}


@app.post("/api/rooms/{room_id}/start")
async def start_game(room_id: str, player_id: str):
    """Start the game (host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.host_id != player_id:
        raise HTTPException(status_code=403, detail="只有房主可以开始游戏")
    
    if len(room.players) != 7:
        raise HTTPException(status_code=400, detail="需要7名玩家才能开始游戏")
    
    # Create game engine with broadcast callback
    async def broadcast_callback(message: GameMessage):
        await connection_manager.broadcast_to_room(room_id, message.model_dump(mode="json"))
    
    engine = GameEngine(room, broadcast_callback)
    game_engines[room_id] = engine
    
    # Start game in background
    asyncio.create_task(engine.start_game())
    
    return {"success": True, "message": "游戏开始"}


@app.post("/api/rooms/{room_id}/restart")
async def restart_game(room_id: str, player_id: str):
    """Restart the game (host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.host_id != player_id:
        raise HTTPException(status_code=403, detail="只有房主可以重新开始游戏")
    
    # Clean up old game engine
    if room_id in game_engines:
        old_engine = game_engines[room_id]
        old_engine.is_running = False
        del game_engines[room_id]
    
    # Reset room state
    room.game_state.phase = GamePhase.WAITING
    for player in room.players:
        player.role = None
        player.is_captain = False
        player.is_on_mission = False
    
    # Notify all players
    await connection_manager.broadcast_to_room(room_id, {
        "type": "game_restart",
        "message": "游戏已重置，准备重新开始"
    })
    
    return {"success": True, "message": "游戏已重置"}


@app.get("/api/rooms/{room_id}/state")
async def get_game_state(room_id: str, player_id: str):
    """Get game state and role info for a player."""
    engine = game_engines.get(room_id)
    if not engine:
        raise HTTPException(status_code=404, detail="游戏未开始")
    
    role_info = engine.get_player_role_info(player_id)
    room = room_manager.get_room(room_id)
    
    return {
        "phase": room.game_state.phase.value if room else "unknown",
        "is_running": engine.is_running,
        "role_info": role_info,
        "host_id": room.host_id if room else None,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "seat": p.seat,
                "player_type": p.player_type.value
            }
            for p in room.players
        ] if room else []
    }


# ==================== WebSocket ====================

@app.websocket("/ws/{room_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_id: str):
    """WebSocket connection for real-time game updates."""
    room = room_manager.get_room(room_id)
    if not room:
        await websocket.close(code=4004, reason="房间不存在")
        return
    
    player = room_manager.get_player_in_room(room_id, player_id)
    if not player:
        await websocket.close(code=4004, reason="玩家不在房间中")
        return
    
    await connection_manager.connect(websocket, room_id, player_id)
    player.is_online = True
    
    # Notify others
    await connection_manager.broadcast_to_room(room_id, {
        "type": "player_online",
        "player_id": player_id,
        "player_name": player.name
    }, exclude={player_id})
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong or other client messages
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif message.get("type") == "player_input":
                # Handle human player input
                engine = game_engines.get(room_id)
                if engine:
                    input_text = message.get("content", "")
                    success = engine.provide_human_input(player.name, input_text)
                    await websocket.send_json({
                        "type": "input_received",
                        "success": success
                    })
    
    except WebSocketDisconnect:
        connection_manager.disconnect(room_id, player_id)
        player.is_online = False
        
        await connection_manager.broadcast_to_room(room_id, {
            "type": "player_offline",
            "player_id": player_id,
            "player_name": player.name
        })


# ==================== Health Check ====================

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "rooms": len(room_manager.rooms),
        "active_games": len(game_engines)
    }


if __name__ == "__main__":
    import uvicorn
    from .config import HOST, PORT
    uvicorn.run(app, host=HOST, port=PORT)
