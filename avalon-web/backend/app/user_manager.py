"""
User management for handling user accounts, AI credits, and favorite AI names.
Uses SQLite database for persistent storage.
"""
import uuid
import hashlib
from typing import Dict, List, Optional
from datetime import datetime

from .logger import api_logger as logger
from .database import db
from .sms_service import sms_service
from .wechat_service import wechat_service, WeChatUserInfo


# 新用户默认AI玩家额度
DEFAULT_AI_CREDITS = 20


class UserManager:
    """用户管理器"""
    
    def __init__(self):
        # 内存中的会话管理（可以后续改为Redis等）
        self.sessions: Dict[str, str] = {}  # session_token -> user_id
        self.user_sessions: Dict[str, str] = {}  # user_id -> session_token (反向映射，用于单端登录)
        logger.info(f"用户管理器初始化完成，当前用户数: {db.get_user_count()}")
    
    def _invalidate_user_sessions(self, user_id: str) -> Optional[str]:
        """
        使该用户的所有旧session失效（单端登录）
        返回被踢掉的旧 session_token（如果有）
        """
        old_token = self.user_sessions.get(user_id)
        if old_token:
            # 从 sessions 中移除旧 token
            self.sessions.pop(old_token, None)
            logger.info(f"用户 {user_id} 的旧会话已失效（单端登录）")
        return old_token
    
    def _create_session(self, user_id: str) -> str:
        """
        为用户创建新 session，同时清除旧 session（单端登录）
        """
        # 先清除旧session
        self._invalidate_user_sessions(user_id)
        
        # 创建新session
        session_token = self._generate_session_token()
        self.sessions[session_token] = user_id
        self.user_sessions[user_id] = session_token
        
        return session_token
    
    def _hash_password(self, password: str) -> str:
        """密码哈希"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def _generate_session_token(self) -> str:
        """生成会话token"""
        return str(uuid.uuid4())
    
    def register(self, username: str, password: str) -> tuple[bool, str, Optional[str]]:
        """
        用户名密码注册
        返回: (success, message, session_token)
        """
        # 验证用户名
        if not username or len(username) < 2 or len(username) > 20:
            return False, "用户名长度需要在2-20个字符之间", None
        
        # 检查用户名是否已存在
        if db.get_user_by_username(username):
            return False, "用户名已存在", None
        
        # 验证密码
        if not password or len(password) < 6:
            return False, "密码长度至少6个字符", None
        
        # 创建用户
        user_id = str(uuid.uuid4())
        password_hash = self._hash_password(password)
        
        if not db.create_user(
            user_id=user_id,
            username=username,
            password_hash=password_hash,
            ai_credits=DEFAULT_AI_CREDITS
        ):
            return False, "注册失败，请稍后重试", None
        
        # 自动登录（单端登录）
        session_token = self._create_session(user_id)
        
        logger.info(f"用户注册成功: {username}, 赠送 {DEFAULT_AI_CREDITS} AI额度")
        return True, f"注册成功！赠送 {DEFAULT_AI_CREDITS} 人次AI玩家额度", session_token
    
    def login(self, username: str, password: str) -> tuple[bool, str, Optional[str]]:
        """
        用户名密码登录
        返回: (success, message, session_token)
        """
        user = db.get_user_by_username(username)
        if not user:
            return False, "用户名不存在", None
        
        if user['password_hash'] != self._hash_password(password):
            return False, "密码错误", None
        
        # 更新最后登录时间
        db.update_last_login_by_id(user['id'])
        
        # 生成会话token（单端登录，踢掉旧设备）
        session_token = self._create_session(user['id'])
        
        logger.info(f"用户登录: {username}")
        return True, "登录成功", session_token
    
    def logout(self, session_token: str) -> bool:
        """用户登出"""
        if session_token in self.sessions:
            user_id = self.sessions.pop(session_token)
            # 清除反向映射
            if self.user_sessions.get(user_id) == session_token:
                del self.user_sessions[user_id]
            logger.info(f"用户登出: {user_id}")
            return True
        return False
    
    def get_user_by_session(self, session_token: str) -> Optional[dict]:
        """通过session获取用户"""
        user_id = self.sessions.get(session_token)
        if user_id:
            return db.get_user_by_id(user_id)
        return None
    
    # ========== 手机号验证码登录 ==========
    
    def send_sms_code(self, phone: str) -> tuple[bool, str]:
        """发送短信验证码"""
        return sms_service.send_code(phone)
    
    def login_by_phone(self, phone: str, code: str) -> tuple[bool, str, Optional[str]]:
        """
        手机号验证码登录/注册
        返回: (success, message, session_token)
        """
        # 验证验证码
        success, msg = sms_service.verify_code(phone, code)
        if not success:
            return False, msg, None
        
        # 查找用户
        user = db.get_user_by_phone(phone)
        
        if user:
            # 已注册用户，直接登录（单端登录）
            db.update_last_login_by_id(user['id'])
            session_token = self._create_session(user['id'])
            logger.info(f"手机号登录成功: {phone[-4:].rjust(11, '*')}")
            return True, "登录成功", session_token
        else:
            # 新用户，自动注册
            user_id = str(uuid.uuid4())
            # 生成默认昵称
            nickname = f"用户{phone[-4:]}"
            
            if not db.create_user(
                user_id=user_id,
                username=None,  # 手机号注册不设置用户名
                password_hash=None,
                ai_credits=DEFAULT_AI_CREDITS,
                phone=phone,
                nickname=nickname
            ):
                return False, "注册失败，请稍后重试", None
            
            # 单端登录
            session_token = self._create_session(user_id)
            
            logger.info(f"手机号注册成功: {phone[-4:].rjust(11, '*')}, 赠送 {DEFAULT_AI_CREDITS} AI额度")
            return True, f"注册成功！赠送 {DEFAULT_AI_CREDITS} 人次AI玩家额度", session_token
    
    # ========== 微信登录 ==========
    
    def get_wechat_oauth_url(self, state: str = "") -> str:
        """获取微信扫码登录URL"""
        return wechat_service.get_oauth_url(state)
    
    def login_by_wechat(self, code: str) -> tuple[bool, str, Optional[str]]:
        """
        微信授权登录/注册（网页/APP）
        返回: (success, message, session_token)
        """
        # 通过code获取微信用户信息
        wechat_user, error = wechat_service.get_user_by_code(code)
        if error:
            return False, error, None
        
        return self._handle_wechat_login(wechat_user)
    
    def login_by_wechat_mp(self, code: str) -> tuple[bool, str, Optional[str]]:
        """
        微信小程序登录/注册
        返回: (success, message, session_token)
        """
        # 通过code获取小程序用户信息
        wechat_user, error = wechat_service.get_mp_user_by_code(code)
        if error:
            return False, error, None
        
        return self._handle_wechat_login(wechat_user)
    
    def _handle_wechat_login(self, wechat_user: WeChatUserInfo) -> tuple[bool, str, Optional[str]]:
        """处理微信登录逻辑"""
        # 查找用户
        user = db.get_user_by_wechat(wechat_user.openid)
        
        if user:
            # 已注册用户，更新信息并登录
            if wechat_user.nickname or wechat_user.avatar_url:
                db.update_user_profile(
                    user['id'],
                    nickname=wechat_user.nickname,
                    avatar_url=wechat_user.avatar_url
                )
            db.update_last_login_by_id(user['id'])
            
            # 单端登录
            session_token = self._create_session(user['id'])
            logger.info(f"微信登录成功: openid={wechat_user.openid[:8]}...")
            return True, "登录成功", session_token
        else:
            # 新用户，自动注册
            user_id = str(uuid.uuid4())
            nickname = wechat_user.nickname or f"微信用户{wechat_user.openid[-4:]}"
            
            if not db.create_user(
                user_id=user_id,
                username=None,
                password_hash=None,
                ai_credits=DEFAULT_AI_CREDITS,
                wechat_openid=wechat_user.openid,
                wechat_unionid=wechat_user.unionid,
                nickname=nickname,
                avatar_url=wechat_user.avatar_url
            ):
                return False, "注册失败，请稍后重试", None
            
            # 单端登录
            session_token = self._create_session(user_id)
            
            logger.info(f"微信注册成功: openid={wechat_user.openid[:8]}..., 赠送 {DEFAULT_AI_CREDITS} AI额度")
            return True, f"注册成功！赠送 {DEFAULT_AI_CREDITS} 人次AI玩家额度", session_token
    
    def get_user_info(self, session_token: str) -> Optional[dict]:
        """获取用户信息（不包含敏感数据）"""
        user = self.get_user_by_session(session_token)
        if user:
            # 显示名称优先级：nickname > username > phone后4位 > 微信用户
            display_name = user.get('nickname') or user.get('username')
            if not display_name and user.get('phone'):
                display_name = f"用户{user['phone'][-4:]}"
            if not display_name and user.get('wechat_openid'):
                display_name = f"微信用户{user['wechat_openid'][-4:]}"
            
            return {
                "id": user['id'],
                "username": user.get('username'),
                "nickname": user.get('nickname'),
                "display_name": display_name or "用户",
                "phone": user['phone'][-4:].rjust(11, '*') if user.get('phone') else None,
                "has_wechat": bool(user.get('wechat_openid')),
                "avatar_url": user.get('avatar_url'),
                "ai_credits": user['ai_credits'],
                "favorite_ai_names": user['favorite_ai_names'],
                "favorite_ai_players": user.get('favorite_ai_players', []),
                "total_games": user['total_games'],
                "total_ai_used": user['total_ai_used'],
                "created_at": user['created_at']
            }
        return None
    
    def check_ai_credits(self, session_token: str, count: int) -> tuple[bool, str]:
        """
        检查AI额度是否足够
        返回: (sufficient, message)
        """
        user = self.get_user_by_session(session_token)
        if not user:
            return False, "用户未登录"
        
        if user['ai_credits'] < count:
            return False, f"AI玩家额度不足，当前剩余 {user['ai_credits']} 人次"
        
        return True, f"额度充足，当前剩余 {user['ai_credits']} 人次"
    
    def consume_ai_credits(self, session_token: str, count: int) -> tuple[bool, str]:
        """
        消费AI额度
        返回: (success, message)
        """
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        success, remaining = db.consume_ai_credits_by_id(user_id, count)
        if not success:
            return False, f"AI玩家额度不足，当前剩余 {remaining} 人次"
        
        logger.info(f"用户 {user_id} 消费 {count} AI额度，剩余 {remaining}")
        return True, f"已消费 {count} 人次AI额度，剩余 {remaining} 人次"
    
    def add_ai_credits(self, session_token: str, count: int) -> tuple[bool, str]:
        """
        添加AI额度（充值）
        返回: (success, message)
        """
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        success, new_credits = db.add_ai_credits_by_id(user_id, count)
        if not success:
            return False, "充值失败"
        
        logger.info(f"用户 {user_id} 充值 {count} AI额度，当前 {new_credits}")
        return True, f"已充值 {count} 人次AI额度，当前剩余 {new_credits} 人次"
    
    def record_game_start(self, session_token: str, ai_count: int) -> tuple[bool, str]:
        """
        记录游戏开始，消费AI额度
        返回: (success, message)
        """
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if ai_count > 0:
            success, msg = self.consume_ai_credits(session_token, ai_count)
            if not success:
                return False, msg
        
        db.update_game_stats_by_id(user_id, ai_count)
        return True, f"游戏开始，消费 {ai_count} AI额度"
    
    # ========== 常用AI玩家名管理 ==========
    
    def get_favorite_ai_names(self, session_token: str) -> List[str]:
        """获取用户常用的AI玩家名列表"""
        user_id = self.sessions.get(session_token)
        if user_id:
            return db.get_favorite_ai_names_by_id(user_id)
        return []
    
    def add_favorite_ai_name(self, session_token: str, name: str) -> tuple[bool, str]:
        """添加常用AI玩家名"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if not name or len(name) > 20:
            return False, "名称长度需要在1-20个字符之间"
        
        success, msg = db.add_favorite_ai_name_by_id(user_id, name)
        if success:
            logger.debug(f"用户 {user_id} 添加常用AI名: {name}")
        return success, msg
    
    def remove_favorite_ai_name(self, session_token: str, name: str) -> tuple[bool, str]:
        """删除常用AI玩家名"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        success, msg = db.remove_favorite_ai_name_by_id(user_id, name)
        if success:
            logger.debug(f"用户 {user_id} 删除常用AI名: {name}")
        return success, msg
    
    def update_favorite_ai_names(self, session_token: str, names: List[str]) -> tuple[bool, str]:
        """更新常用AI玩家名列表（替换整个列表）"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if len(names) > 20:
            return False, "最多保存20个常用名称"
        
        # 验证每个名称
        for name in names:
            if not name or len(name) > 20:
                return False, f"名称 '{name}' 长度需要在1-20个字符之间"
        
        if db.set_favorite_ai_names_by_id(user_id, names):
            logger.debug(f"用户 {user_id} 更新常用AI名列表: {names}")
            return True, "更新成功"
        return False, "更新失败"
    
    # ========== 常用AI玩家信息管理（含personality） ==========
    
    def get_favorite_ai_players(self, session_token: str) -> List[dict]:
        """获取用户常用的AI玩家列表（含personality）"""
        user_id = self.sessions.get(session_token)
        if user_id:
            return db.get_favorite_ai_players_by_id(user_id)
        return []
    
    def add_favorite_ai_player(self, session_token: str, name: str, personality: str = "") -> tuple[bool, str]:
        """添加常用AI玩家"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if not name or len(name) > 20:
            return False, "名称长度需要在1-20个字符之间"
        
        if personality and len(personality) > 100:
            return False, "人设描述最多100个字符"
        
        player = {"name": name, "personality": personality or ""}
        success, msg = db.add_favorite_ai_player_by_id(user_id, player)
        if success:
            logger.debug(f"用户 {user_id} 添加常用AI玩家: {name}")
        return success, msg
    
    def update_favorite_ai_player(self, session_token: str, name: str, personality: str) -> tuple[bool, str]:
        """更新常用AI玩家"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if personality and len(personality) > 100:
            return False, "人设描述最多100个字符"
        
        player = {"name": name, "personality": personality or ""}
        success, msg = db.update_favorite_ai_player_by_id(user_id, player)
        if success:
            logger.debug(f"用户 {user_id} 更新常用AI玩家: {name}")
        return success, msg
    
    def remove_favorite_ai_player(self, session_token: str, name: str) -> tuple[bool, str]:
        """删除常用AI玩家"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        success, msg = db.remove_favorite_ai_player_by_id(user_id, name)
        if success:
            logger.debug(f"用户 {user_id} 删除常用AI玩家: {name}")
        return success, msg
    
    def update_favorite_ai_players(self, session_token: str, players: List[dict]) -> tuple[bool, str]:
        """更新常用AI玩家列表（替换整个列表）"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录"
        
        if len(players) > 20:
            return False, "最多保存20个常用AI玩家"
        
        # 验证每个玩家
        for player in players:
            name = player.get('name', '')
            personality = player.get('personality', '')
            if not name or len(name) > 20:
                return False, f"名称 '{name}' 长度需要在1-20个字符之间"
            if personality and len(personality) > 100:
                return False, f"玩家 '{name}' 的人设描述最多100个字符"
        
        if db.set_favorite_ai_players_by_id(user_id, players):
            logger.debug(f"用户 {user_id} 更新常用AI玩家列表")
            return True, "更新成功"
        return False, "更新失败"

    # ========== 支付相关 ==========
    
    # 价格配置（单位：分）
    PRICE_PER_CREDIT = 100  # 1元 = 100分 = 1个AI额度
    
    # 套餐配置：(额度, 价格分, 描述)
    CREDIT_PACKAGES = [
        (1, 100, "1人次"),
        (5, 400, "5人次（8折）"),
        (10, 700, "10人次（7折）"),
        (20, 1200, "20人次（6折）"),
        (50, 2500, "50人次（5折）"),
    ]
    
    def get_credit_packages(self) -> list:
        """获取额度套餐列表"""
        return [
            {
                "credits": credits,
                "price": price,
                "price_yuan": price / 100,
                "description": desc,
                "unit_price": round(price / credits / 100, 2)
            }
            for credits, price, desc in self.CREDIT_PACKAGES
        ]
    
    def create_order(self, session_token: str, credits: int, 
                     payment_method: str = 'wechat') -> tuple[bool, str, Optional[dict]]:
        """
        创建充值订单
        返回: (success, message, order_info)
        """
        user_id = self.sessions.get(session_token)
        if not user_id:
            return False, "用户未登录", None
        
        # 查找套餐价格
        price = None
        for pkg_credits, pkg_price, _ in self.CREDIT_PACKAGES:
            if pkg_credits == credits:
                price = pkg_price
                break
        
        if price is None:
            return False, "无效的充值套餐", None
        
        # 生成订单ID
        order_id = f"ORD{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8].upper()}"
        
        # 创建订单
        if not db.create_order(order_id, user_id, price, credits, payment_method):
            return False, "创建订单失败", None
        
        order_info = {
            "order_id": order_id,
            "credits": credits,
            "amount": price,
            "amount_yuan": price / 100,
            "payment_method": payment_method,
            "status": "pending"
        }
        
        logger.info(f"用户 {user_id} 创建订单 {order_id}, 充值 {credits} 额度, 金额 {price/100}元")
        return True, "订单创建成功", order_info
    
    def process_payment(self, order_id: str, transaction_id: str = None) -> tuple[bool, str]:
        """
        处理支付成功回调
        返回: (success, message)
        """
        order = db.get_order(order_id)
        if not order:
            return False, "订单不存在"
        
        if order['status'] == 'paid':
            return True, "订单已处理"
        
        if order['status'] != 'pending':
            return False, "订单状态异常"
        
        # 更新订单状态
        if not db.update_order_paid(order_id, transaction_id):
            return False, "更新订单状态失败"
        
        # 添加AI额度
        success, new_credits = db.add_ai_credits_by_id(order['user_id'], order['credits'])
        if not success:
            return False, "添加额度失败"
        
        logger.info(f"订单 {order_id} 支付成功, 用户 {order['user_id']} 充值 {order['credits']} 额度, 当前 {new_credits}")
        return True, f"充值成功，获得 {order['credits']} 人次AI额度"
    
    def get_order(self, session_token: str, order_id: str) -> Optional[dict]:
        """获取订单信息"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return None
        
        order = db.get_order(order_id)
        if order and order['user_id'] == user_id:
            return order
        return None
    
    def get_user_orders(self, session_token: str) -> list:
        """获取用户订单列表"""
        user_id = self.sessions.get(session_token)
        if not user_id:
            return []
        return db.get_user_orders(user_id)
    
    def simulate_payment(self, order_id: str) -> tuple[bool, str]:
        """
        模拟支付成功（仅开发环境使用）
        """
        return self.process_payment(order_id, f"SIM_{uuid.uuid4().hex[:12].upper()}")


# 全局用户管理器实例
user_manager = UserManager()
