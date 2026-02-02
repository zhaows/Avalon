"""
SQLite database module for user data storage.
Provides a clean interface for user CRUD operations.
"""
import sqlite3
import json
from typing import Optional, List, Dict, Any
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime

from .logger import api_logger as logger


# 数据库文件路径
DB_PATH = Path(__file__).parent.parent / "data" / "avalon.db"


class Database:
    """SQLite数据库管理类"""
    
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._ensure_db_dir()
        self._init_db()
    
    def _ensure_db_dir(self):
        """确保数据库目录存在"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
    
    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row  # 使结果可以用列名访问
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()
    
    def _init_db(self):
        """初始化数据库表结构"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # 用户表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE,
                    password_hash TEXT,
                    phone TEXT UNIQUE,
                    wechat_openid TEXT UNIQUE,
                    wechat_unionid TEXT,
                    nickname TEXT,
                    avatar_url TEXT,
                    ai_credits INTEGER DEFAULT 20,
                    favorite_ai_names TEXT DEFAULT '[]',
                    favorite_ai_players TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    last_login TEXT NOT NULL,
                    total_games INTEGER DEFAULT 0,
                    total_ai_used INTEGER DEFAULT 0
                )
            ''')
            
            # 创建索引
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_username ON users(username)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_phone ON users(phone)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_wechat_openid ON users(wechat_openid)
            ''')
            
            # 数据库迁移：添加新字段（如果不存在）
            self._migrate_add_columns(cursor)
            
            logger.info(f"数据库初始化完成: {self.db_path}")
    
    def _migrate_add_columns(self, cursor):
        """数据库迁移：为旧表添加新字段"""
        # 获取现有列
        cursor.execute("PRAGMA table_info(users)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        # 需要添加的新列
        new_columns = [
            ("phone", "TEXT UNIQUE"),
            ("wechat_openid", "TEXT UNIQUE"),
            ("wechat_unionid", "TEXT"),
            ("nickname", "TEXT"),
            ("avatar_url", "TEXT"),
            ("favorite_ai_players", "TEXT DEFAULT '[]'"),  # 新增：完整的AI玩家信息列表
        ]
        
        for col_name, col_type in new_columns:
            if col_name not in existing_columns:
                try:
                    # SQLite不支持ADD COLUMN UNIQUE，需要分开处理
                    base_type = col_type.replace(" UNIQUE", "")
                    cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {base_type}")
                    logger.info(f"数据库迁移：添加列 {col_name}")
                except sqlite3.OperationalError:
                    pass  # 列已存在
    
    # ==================== 用户操作 ====================
    
    def create_user(self, user_id: str, username: str = None, password_hash: str = None,
                    phone: str = None, wechat_openid: str = None, wechat_unionid: str = None,
                    nickname: str = None, avatar_url: str = None,
                    ai_credits: int = 20) -> bool:
        """创建新用户"""
        now = datetime.now().isoformat()
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO users (id, username, password_hash, phone, wechat_openid,
                                       wechat_unionid, nickname, avatar_url, ai_credits,
                                       favorite_ai_names, favorite_ai_players, created_at, last_login,
                                       total_games, total_ai_used)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, 0, 0)
                ''', (user_id, username, password_hash, phone, wechat_openid,
                      wechat_unionid, nickname, avatar_url, ai_credits, now, now))
            logger.info(f"创建用户成功: {username or phone or wechat_openid}")
            return True
        except sqlite3.IntegrityError as e:
            logger.warning(f"用户创建失败（唯一约束）: {e}")
            return False
        except Exception as e:
            logger.error(f"创建用户失败: {e}")
            return False
    
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """通过用户名获取用户"""
        if not username:
            return None
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None
    
    def get_user_by_phone(self, phone: str) -> Optional[Dict[str, Any]]:
        """通过手机号获取用户"""
        if not phone:
            return None
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE phone = ?', (phone,))
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None
    
    def get_user_by_wechat(self, openid: str) -> Optional[Dict[str, Any]]:
        """通过微信openid获取用户"""
        if not openid:
            return None
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE wechat_openid = ?', (openid,))
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """通过ID获取用户"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None
    
    def update_last_login(self, username: str) -> bool:
        """更新最后登录时间（通过用户名）"""
        now = datetime.now().isoformat()
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET last_login = ? WHERE username = ?
                ''', (now, username))
            return True
        except Exception as e:
            logger.error(f"更新登录时间失败: {e}")
            return False
    
    def update_last_login_by_id(self, user_id: str) -> bool:
        """更新最后登录时间（通过用户ID）"""
        now = datetime.now().isoformat()
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET last_login = ? WHERE id = ?
                ''', (now, user_id))
            return True
        except Exception as e:
            logger.error(f"更新登录时间失败: {e}")
            return False
    
    def update_user_profile(self, user_id: str, nickname: str = None, avatar_url: str = None) -> bool:
        """更新用户资料"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                updates = []
                params = []
                if nickname is not None:
                    updates.append("nickname = ?")
                    params.append(nickname)
                if avatar_url is not None:
                    updates.append("avatar_url = ?")
                    params.append(avatar_url)
                
                if not updates:
                    return True
                
                params.append(user_id)
                cursor.execute(f'''
                    UPDATE users SET {", ".join(updates)} WHERE id = ?
                ''', params)
            return True
        except Exception as e:
            logger.error(f"更新用户资料失败: {e}")
            return False
    
    def update_ai_credits(self, username: str, ai_credits: int) -> bool:
        """更新AI额度"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET ai_credits = ? WHERE username = ?
                ''', (ai_credits, username))
            return True
        except Exception as e:
            logger.error(f"更新AI额度失败: {e}")
            return False
    
    def update_game_stats(self, username: str, ai_used: int = 0) -> bool:
        """更新游戏统计"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users 
                    SET total_games = total_games + 1,
                        total_ai_used = total_ai_used + ?
                    WHERE username = ?
                ''', (ai_used, username))
            return True
        except Exception as e:
            logger.error(f"更新游戏统计失败: {e}")
            return False
    
    def consume_ai_credits(self, username: str, count: int) -> tuple[bool, int]:
        """
        消费AI额度（通过用户名，向后兼容）
        返回: (success, remaining_credits)
        """
        return self.consume_ai_credits_by_id(self._get_user_id_by_username(username), count)
    
    def consume_ai_credits_by_id(self, user_id: str, count: int) -> tuple[bool, int]:
        """
        消费AI额度（通过用户ID）
        返回: (success, remaining_credits)
        """
        if not user_id:
            return False, 0
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                # 先检查余额
                cursor.execute('SELECT ai_credits FROM users WHERE id = ?', (user_id,))
                row = cursor.fetchone()
                if not row:
                    return False, 0
                
                current_credits = row['ai_credits']
                if current_credits < count:
                    return False, current_credits
                
                # 扣除额度
                new_credits = current_credits - count
                cursor.execute('''
                    UPDATE users 
                    SET ai_credits = ?, total_ai_used = total_ai_used + ?
                    WHERE id = ?
                ''', (new_credits, count, user_id))
                
            return True, new_credits
        except Exception as e:
            logger.error(f"消费AI额度失败: {e}")
            return False, 0
    
    def add_ai_credits(self, username: str, count: int) -> tuple[bool, int]:
        """
        添加AI额度（通过用户名，向后兼容）
        返回: (success, new_credits)
        """
        return self.add_ai_credits_by_id(self._get_user_id_by_username(username), count)
    
    def add_ai_credits_by_id(self, user_id: str, count: int) -> tuple[bool, int]:
        """
        添加AI额度（通过用户ID）
        返回: (success, new_credits)
        """
        if not user_id:
            return False, 0
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET ai_credits = ai_credits + ? WHERE id = ?
                ''', (count, user_id))
                cursor.execute('SELECT ai_credits FROM users WHERE id = ?', (user_id,))
                row = cursor.fetchone()
                return True, row['ai_credits'] if row else 0
        except Exception as e:
            logger.error(f"添加AI额度失败: {e}")
            return False, 0
    
    def update_game_stats_by_id(self, user_id: str, ai_used: int = 0) -> bool:
        """更新游戏统计（通过用户ID）"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users 
                    SET total_games = total_games + 1,
                        total_ai_used = total_ai_used + ?
                    WHERE id = ?
                ''', (ai_used, user_id))
            return True
        except Exception as e:
            logger.error(f"更新游戏统计失败: {e}")
            return False
    
    def _get_user_id_by_username(self, username: str) -> Optional[str]:
        """通过用户名获取用户ID"""
        if not username:
            return None
        user = self.get_user_by_username(username)
        return user['id'] if user else None
    
    # ==================== 常用AI名操作 ====================
    
    def get_favorite_ai_names(self, username: str) -> List[str]:
        """获取常用AI名列表（通过用户名，向后兼容）"""
        user_id = self._get_user_id_by_username(username)
        return self.get_favorite_ai_names_by_id(user_id) if user_id else []
    
    def get_favorite_ai_names_by_id(self, user_id: str) -> List[str]:
        """获取常用AI名列表（通过用户ID）"""
        if not user_id:
            return []
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT favorite_ai_names FROM users WHERE id = ?', (user_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row['favorite_ai_names'])
            return []
    
    def set_favorite_ai_names(self, username: str, names: List[str]) -> bool:
        """设置常用AI名列表（通过用户名，向后兼容）"""
        user_id = self._get_user_id_by_username(username)
        return self.set_favorite_ai_names_by_id(user_id, names) if user_id else False
    
    def set_favorite_ai_names_by_id(self, user_id: str, names: List[str]) -> bool:
        """设置常用AI名列表（通过用户ID）"""
        if not user_id:
            return False
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET favorite_ai_names = ? WHERE id = ?
                ''', (json.dumps(names, ensure_ascii=False), user_id))
            return True
        except Exception as e:
            logger.error(f"设置常用AI名失败: {e}")
            return False
    
    def add_favorite_ai_name(self, username: str, name: str) -> tuple[bool, str]:
        """添加常用AI名（通过用户名，向后兼容）"""
        user_id = self._get_user_id_by_username(username)
        return self.add_favorite_ai_name_by_id(user_id, name) if user_id else (False, "用户不存在")
    
    def add_favorite_ai_name_by_id(self, user_id: str, name: str) -> tuple[bool, str]:
        """添加常用AI名（通过用户ID）"""
        if not user_id:
            return False, "用户不存在"
        names = self.get_favorite_ai_names_by_id(user_id)
        if name in names:
            return False, "该名称已存在"
        if len(names) >= 20:
            return False, "最多保存20个常用名称"
        names.append(name)
        if self.set_favorite_ai_names_by_id(user_id, names):
            return True, "添加成功"
        return False, "添加失败"
    
    def remove_favorite_ai_name(self, username: str, name: str) -> tuple[bool, str]:
        """删除常用AI名（通过用户名，向后兼容）"""
        user_id = self._get_user_id_by_username(username)
        return self.remove_favorite_ai_name_by_id(user_id, name) if user_id else (False, "用户不存在")
    
    def remove_favorite_ai_name_by_id(self, user_id: str, name: str) -> tuple[bool, str]:
        """删除常用AI名（通过用户ID）"""
        if not user_id:
            return False, "用户不存在"
        names = self.get_favorite_ai_names_by_id(user_id)
        if name not in names:
            return False, "该名称不存在"
        names.remove(name)
        if self.set_favorite_ai_names_by_id(user_id, names):
            return True, "删除成功"
        return False, "删除失败"
    
    # ==================== 辅助方法 ====================
    
    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """将数据库行转换为字典"""
        result = dict(row)
        # 解析JSON字段
        if 'favorite_ai_names' in result:
            result['favorite_ai_names'] = json.loads(result['favorite_ai_names'])
        if 'favorite_ai_players' in result and result['favorite_ai_players']:
            result['favorite_ai_players'] = json.loads(result['favorite_ai_players'])
        else:
            result['favorite_ai_players'] = []
        return result
    
    # ==================== 常用AI玩家信息管理（含personality） ====================
    
    def get_favorite_ai_players_by_id(self, user_id: str) -> List[Dict[str, str]]:
        """获取常用AI玩家列表（通过用户ID）"""
        if not user_id:
            return []
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT favorite_ai_players FROM users WHERE id = ?', (user_id,))
                row = cursor.fetchone()
                if row and row['favorite_ai_players']:
                    return json.loads(row['favorite_ai_players'])
        except Exception as e:
            logger.error(f"获取常用AI玩家失败: {e}")
        return []
    
    def set_favorite_ai_players_by_id(self, user_id: str, players: List[Dict[str, str]]) -> bool:
        """设置常用AI玩家列表（通过用户ID）"""
        if not user_id:
            return False
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users SET favorite_ai_players = ? WHERE id = ?
                ''', (json.dumps(players, ensure_ascii=False), user_id))
            return True
        except Exception as e:
            logger.error(f"设置常用AI玩家失败: {e}")
            return False
    
    def add_favorite_ai_player_by_id(self, user_id: str, player: Dict[str, str]) -> tuple[bool, str]:
        """添加常用AI玩家（通过用户ID）"""
        if not user_id:
            return False, "用户不存在"
        players = self.get_favorite_ai_players_by_id(user_id)
        # 检查是否已存在同名玩家
        if any(p['name'] == player['name'] for p in players):
            return False, "该名称已存在"
        if len(players) >= 20:
            return False, "最多保存20个常用AI玩家"
        players.append(player)
        if self.set_favorite_ai_players_by_id(user_id, players):
            return True, "添加成功"
        return False, "添加失败"
    
    def update_favorite_ai_player_by_id(self, user_id: str, player: Dict[str, str]) -> tuple[bool, str]:
        """更新常用AI玩家（通过用户ID，根据name匹配）"""
        if not user_id:
            return False, "用户不存在"
        players = self.get_favorite_ai_players_by_id(user_id)
        for i, p in enumerate(players):
            if p['name'] == player['name']:
                players[i] = player
                if self.set_favorite_ai_players_by_id(user_id, players):
                    return True, "更新成功"
                return False, "更新失败"
        return False, "该玩家不存在"
    
    def remove_favorite_ai_player_by_id(self, user_id: str, name: str) -> tuple[bool, str]:
        """删除常用AI玩家（通过用户ID）"""
        if not user_id:
            return False, "用户不存在"
        players = self.get_favorite_ai_players_by_id(user_id)
        new_players = [p for p in players if p['name'] != name]
        if len(new_players) == len(players):
            return False, "该玩家不存在"
        if self.set_favorite_ai_players_by_id(user_id, new_players):
            return True, "删除成功"
        return False, "删除失败"
    
    def get_user_count(self) -> int:
        """获取用户总数"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM users')
            return cursor.fetchone()[0]

    # ==================== 订单操作 ====================
    
    def _init_orders_table(self):
        """初始化订单表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    credits INTEGER NOT NULL,
                    status TEXT DEFAULT 'pending',
                    payment_method TEXT,
                    transaction_id TEXT,
                    created_at TEXT NOT NULL,
                    paid_at TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)
            ''')
    
    def create_order(self, order_id: str, user_id: str, amount: int, credits: int,
                     payment_method: str = 'wechat') -> bool:
        """创建订单"""
        now = datetime.now().isoformat()
        try:
            # 确保订单表存在
            self._init_orders_table()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO orders (id, user_id, amount, credits, status, payment_method, created_at)
                    VALUES (?, ?, ?, ?, 'pending', ?, ?)
                ''', (order_id, user_id, amount, credits, payment_method, now))
            logger.info(f"创建订单成功: {order_id}, 金额={amount}分, 额度={credits}")
            return True
        except Exception as e:
            logger.error(f"创建订单失败: {e}")
            return False
    
    def get_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """获取订单"""
        try:
            self._init_orders_table()
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM orders WHERE id = ?', (order_id,))
                row = cursor.fetchone()
                if row:
                    return self._row_to_dict(row)
                return None
        except Exception as e:
            logger.error(f"获取订单失败: {e}")
            return None
    
    def update_order_paid(self, order_id: str, transaction_id: str = None) -> bool:
        """更新订单为已支付状态"""
        now = datetime.now().isoformat()
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE orders SET status = 'paid', transaction_id = ?, paid_at = ?
                    WHERE id = ? AND status = 'pending'
                ''', (transaction_id, now, order_id))
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"更新订单状态失败: {e}")
            return False
    
    def get_user_orders(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """获取用户订单列表"""
        try:
            self._init_orders_table()
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM orders WHERE user_id = ? 
                    ORDER BY created_at DESC LIMIT ?
                ''', (user_id, limit))
                return [self._row_to_dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"获取用户订单失败: {e}")
            return []


# 全局数据库实例
db = Database()
