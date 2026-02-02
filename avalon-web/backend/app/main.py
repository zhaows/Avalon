"""
FastAPI main application - Avalon Web Game Server.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel

from .logger import api_logger as logger, ws_logger
from .models import (
    CreateRoomRequest, JoinRoomRequest, AddAIRequest,
    GamePhase, GameMessage, PlayerType, GameState
)
from .room_manager import room_manager
from .websocket_manager import connection_manager
from .game_engine import GameEngine
from .user_manager import user_manager


# Store active game engines
game_engines: Dict[str, GameEngine] = {}

# Analytics data file path
ANALYTICS_FILE = Path(__file__).parent.parent / "analytics_data.json"


def load_analytics() -> dict:
    """Load analytics data from file."""
    if ANALYTICS_FILE.exists():
        try:
            with open(ANALYTICS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {
        "total_visits": 0,
        "unique_visitors": set(),
        "page_views": {},
        "daily_visits": {},
        "visits": []
    }


def save_analytics(data: dict):
    """Save analytics data to file."""
    # Convert set to list for JSON serialization
    save_data = data.copy()
    if isinstance(save_data.get("unique_visitors"), set):
        save_data["unique_visitors"] = list(save_data["unique_visitors"])
    with open(ANALYTICS_FILE, 'w', encoding='utf-8') as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)


# Global analytics data
analytics_data = load_analytics()
# Convert unique_visitors back to set
if isinstance(analytics_data.get("unique_visitors"), list):
    analytics_data["unique_visitors"] = set(analytics_data["unique_visitors"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    logger.info("🎮 Avalon Web Server starting...")
    yield
    logger.info("🎮 Avalon Web Server shutting down...")


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


# ==================== User API ====================

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class SendSMSRequest(BaseModel):
    phone: str


class PhoneLoginRequest(BaseModel):
    phone: str
    code: str


class WeChatLoginRequest(BaseModel):
    code: str


class FavoriteAINameRequest(BaseModel):
    name: str


class UpdateFavoriteAINamesRequest(BaseModel):
    names: list[str]


# 常用AI玩家信息（含 personality）
class FavoriteAIPlayerRequest(BaseModel):
    name: str
    personality: str = ""


class UpdateFavoriteAIPlayersRequest(BaseModel):
    players: list[dict]  # [{"name": "...", "personality": "..."}]


@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    """用户名密码注册"""
    success, message, token = user_manager.register(request.username, request.password)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "token": token,
        "user": user_info
    }


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """用户名密码登录"""
    success, message, token = user_manager.login(request.username, request.password)
    if not success:
        raise HTTPException(status_code=401, detail=message)
    
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "token": token,
        "user": user_info
    }


@app.post("/api/auth/send-sms")
async def send_sms(request: SendSMSRequest):
    """发送短信验证码"""
    success, message = user_manager.send_sms_code(request.phone)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.post("/api/auth/phone-login")
async def phone_login(request: PhoneLoginRequest):
    """手机号验证码登录/注册"""
    success, message, token = user_manager.login_by_phone(request.phone, request.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "token": token,
        "user": user_info
    }


@app.get("/api/auth/wechat-qrcode")
async def get_wechat_qrcode(state: str = ""):
    """获取微信扫码登录URL"""
    oauth_url = user_manager.get_wechat_oauth_url(state)
    return {"oauth_url": oauth_url}


@app.post("/api/auth/wechat-login")
async def wechat_login(request: WeChatLoginRequest):
    """微信授权登录/注册（网页/APP）"""
    success, message, token = user_manager.login_by_wechat(request.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "token": token,
        "user": user_info
    }


@app.post("/api/auth/wechat-mp-login")
async def wechat_mp_login(request: WeChatLoginRequest):
    """微信小程序登录/注册"""
    success, message, token = user_manager.login_by_wechat_mp(request.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "token": token,
        "user": user_info
    }


@app.post("/api/auth/logout")
async def logout(token: str):
    """用户登出"""
    success = user_manager.logout(token)
    return {"success": success}


@app.get("/api/user/info")
async def get_user_info(token: str):
    """获取用户信息"""
    user_info = user_manager.get_user_info(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="用户未登录或token已过期")
    return user_info


@app.get("/api/user/ai-credits")
async def get_ai_credits(token: str):
    """获取AI额度"""
    user_info = user_manager.get_user_info(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="用户未登录")
    return {
        "ai_credits": user_info["ai_credits"],
        "total_ai_used": user_info["total_ai_used"]
    }


@app.get("/api/user/favorite-ai-names")
async def get_favorite_ai_names(token: str):
    """获取常用AI玩家名列表"""
    names = user_manager.get_favorite_ai_names(token)
    return {"names": names}


@app.post("/api/user/favorite-ai-names")
async def add_favorite_ai_name(token: str, request: FavoriteAINameRequest):
    """添加常用AI玩家名"""
    success, message = user_manager.add_favorite_ai_name(token, request.name)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.delete("/api/user/favorite-ai-names/{name}")
async def remove_favorite_ai_name(token: str, name: str):
    """删除常用AI玩家名"""
    success, message = user_manager.remove_favorite_ai_name(token, name)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.put("/api/user/favorite-ai-names")
async def update_favorite_ai_names(token: str, request: UpdateFavoriteAINamesRequest):
    """更新常用AI玩家名列表"""
    success, message = user_manager.update_favorite_ai_names(token, request.names)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# ==================== 常用AI玩家信息管理（含personality） ====================

@app.get("/api/user/favorite-ai-players")
async def get_favorite_ai_players(token: str):
    """获取常用AI玩家列表（含personality）"""
    players = user_manager.get_favorite_ai_players(token)
    return {"players": players}


@app.post("/api/user/favorite-ai-players")
async def add_favorite_ai_player(token: str, request: FavoriteAIPlayerRequest):
    """添加常用AI玩家"""
    success, message = user_manager.add_favorite_ai_player(token, request.name, request.personality)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.put("/api/user/favorite-ai-players/{name}")
async def update_favorite_ai_player(token: str, name: str, request: FavoriteAIPlayerRequest):
    """更新常用AI玩家"""
    success, message = user_manager.update_favorite_ai_player(token, name, request.personality)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.delete("/api/user/favorite-ai-players/{name}")
async def remove_favorite_ai_player(token: str, name: str):
    """删除常用AI玩家"""
    success, message = user_manager.remove_favorite_ai_player(token, name)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.put("/api/user/favorite-ai-players")
async def update_favorite_ai_players(token: str, request: UpdateFavoriteAIPlayersRequest):
    """更新常用AI玩家列表"""
    success, message = user_manager.update_favorite_ai_players(token, request.players)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# ==================== 支付 API ====================

class CreateOrderRequest(BaseModel):
    credits: int
    payment_method: str = 'wechat'


@app.get("/api/payment/packages")
async def get_credit_packages():
    """获取充值套餐列表"""
    return {"packages": user_manager.get_credit_packages()}


@app.post("/api/payment/order")
async def create_payment_order(token: str, request: CreateOrderRequest):
    """创建充值订单"""
    success, message, order_info = user_manager.create_order(
        token, request.credits, request.payment_method
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # TODO: 这里应该调用微信/支付宝支付API生成支付二维码
    # 目前返回订单信息，由前端展示模拟支付按钮
    return {
        "success": True,
        "message": message,
        "order": order_info,
        # 实际接入支付时，这里应该返回支付URL或二维码
        "pay_url": None  
    }


@app.get("/api/payment/order/{order_id}")
async def get_order_status(token: str, order_id: str):
    """查询订单状态"""
    order = user_manager.get_order(token, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return {"order": order}


@app.get("/api/payment/orders")
async def get_user_orders(token: str):
    """获取用户订单列表"""
    orders = user_manager.get_user_orders(token)
    return {"orders": orders}


@app.post("/api/payment/simulate/{order_id}")
async def simulate_payment(token: str, order_id: str):
    """
    模拟支付成功（仅开发环境）
    实际生产环境应该删除此接口，使用真正的支付回调
    """
    # 验证订单属于该用户
    order = user_manager.get_order(token, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    success, message = user_manager.simulate_payment(order_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # 返回更新后的用户信息
    user_info = user_manager.get_user_info(token)
    return {
        "success": True,
        "message": message,
        "user": user_info
    }


# 微信支付回调（待实现）
# @app.post("/api/payment/wechat/notify")
# async def wechat_payment_notify(request: Request):
#     """微信支付回调通知"""
#     pass


# ==================== Analytics API ====================

class TrackEventRequest(BaseModel):
    event: str
    page: str
    visitor_id: Optional[str] = None
    referrer: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None


@app.post("/api/analytics/track")
async def track_event(request: TrackEventRequest, req: Request):
    """Track a page view or event."""
    global analytics_data
    
    today = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().isoformat()
    
    # Get client info
    client_ip = req.client.host if req.client else "unknown"
    user_agent = req.headers.get("user-agent", "unknown")
    
    # Increment total visits
    analytics_data["total_visits"] += 1
    
    # Track unique visitors by visitor_id or IP
    visitor_key = request.visitor_id or client_ip
    if isinstance(analytics_data["unique_visitors"], set):
        analytics_data["unique_visitors"].add(visitor_key)
    else:
        analytics_data["unique_visitors"] = {visitor_key}
    
    # Track page views
    page = request.page
    if page not in analytics_data["page_views"]:
        analytics_data["page_views"][page] = 0
    analytics_data["page_views"][page] += 1
    
    # Track daily visits
    if today not in analytics_data["daily_visits"]:
        analytics_data["daily_visits"][today] = 0
    analytics_data["daily_visits"][today] += 1
    
    # Store visit record (keep last 1000)
    visit_record = {
        "timestamp": timestamp,
        "event": request.event,
        "page": page,
        "visitor_id": visitor_key,
        "user_agent": user_agent[:200],  # Truncate long user agents
        "referrer": request.referrer,
        "screen": f"{request.screen_width}x{request.screen_height}" if request.screen_width else None
    }
    analytics_data["visits"].append(visit_record)
    analytics_data["visits"] = analytics_data["visits"][-1000:]  # Keep last 1000
    
    # Save to file
    save_analytics(analytics_data)
    
    return {"success": True}


@app.get("/api/analytics/stats")
async def get_analytics_stats():
    """Get analytics statistics."""
    unique_count = len(analytics_data["unique_visitors"]) if isinstance(analytics_data["unique_visitors"], set) else len(set(analytics_data["unique_visitors"]))
    
    return {
        "total_visits": analytics_data["total_visits"],
        "unique_visitors": unique_count,
        "page_views": analytics_data["page_views"],
        "daily_visits": analytics_data["daily_visits"],
        "recent_visits": analytics_data["visits"][-20:]  # Last 20 visits
    }


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
    logger.info(f"API: 创建房间 room_id={room.id}, host={host.name}")
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
                "is_online": p.is_online,
                "personality": p.personality  # AI玩家人设
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
    """Add AI players to the room. Requires login."""
    # 必须登录才能添加AI玩家
    if not request.token:
        raise HTTPException(status_code=401, detail="添加AI玩家需要先登录")
    
    user = user_manager.get_user_by_session(request.token)
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    
    # 检查AI额度是否足够
    ai_count = len(request.players) if request.players else request.count
    sufficient, msg = user_manager.check_ai_credits(request.token, ai_count)
    if not sufficient:
        raise HTTPException(status_code=400, detail=msg)
    
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.game_state.phase != GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="游戏已开始，无法添加玩家")
    
    added = room_manager.add_ai_players(room_id, request.count, request.names, request.players)
    
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
        logger.info(f"API: 停止游戏 room_id={room_id}, by={player_name}")
    
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
async def start_game(room_id: str, player_id: str, token: Optional[str] = None):
    """Start the game (host only)."""
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    
    if room.host_id != player_id:
        raise HTTPException(status_code=403, detail="只有房主可以开始游戏")
    
    if len(room.players) != 7:
        raise HTTPException(status_code=400, detail="需要7名玩家才能开始游戏")
    
    # 统计AI玩家数量
    ai_count = sum(1 for p in room.players if p.player_type == PlayerType.AI)
    
    # 如果有AI玩家，必须登录并且有足够额度
    if ai_count > 0:
        if not token:
            raise HTTPException(status_code=401, detail="使用AI玩家需要先登录")
        
        user = user_manager.get_user_by_session(token)
        if not user:
            raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
        
        sufficient, msg = user_manager.check_ai_credits(token, ai_count)
        if not sufficient:
            raise HTTPException(status_code=400, detail=msg)
        
        # 消费AI额度
        user_manager.record_game_start(token, ai_count)
    
    # Create game engine with broadcast callback
    async def broadcast_callback(message: GameMessage):
        await connection_manager.broadcast_to_room(room_id, message.model_dump(mode="json"))
    
    engine = GameEngine(room, broadcast_callback)
    game_engines[room_id] = engine
    
    # Start game in background
    logger.info(f"API: 开始游戏 room_id={room_id}, players={[p.name for p in room.players]}, ai_count={ai_count}")
    asyncio.create_task(engine.start_game())
    
    return {"success": True, "message": "游戏开始", "ai_consumed": ai_count}


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
                "name": p.display_name or p.name,  # 优先使用display_name
                "seat": p.seat,
                "player_type": p.player_type.value,
                "personality": p.personality  # AI玩家人设
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
    ws_logger.info(f"WebSocket连接: room={room_id}, player={player.name}({player_id})")
    
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
        ws_logger.info(f"WebSocket断开: room={room_id}, player={player.name}({player_id})")
        
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
