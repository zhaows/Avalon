"""
日志配置模块 - Avalon游戏日志
"""
import logging
import sys
from datetime import datetime
from pathlib import Path

# 日志目录
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# 日志文件路径
LOG_FILE = LOG_DIR / f"avalon_{datetime.now().strftime('%Y%m%d')}.log"


def setup_logger(name: str, level: int = logging.DEBUG) -> logging.Logger:
    """
    创建并配置logger
    
    Args:
        name: logger名称
        level: 日志级别
    
    Returns:
        配置好的logger实例
    """
    logger = logging.getLogger(name)
    
    # 避免重复添加handler
    if logger.handlers:
        return logger
    
    logger.setLevel(level)
    
    # 日志格式
    formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-15s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # 文件输出
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    return logger


# 预定义的logger实例
room_logger = setup_logger("Room")
game_logger = setup_logger("Game")
ws_logger = setup_logger("WebSocket")
api_logger = setup_logger("API")
