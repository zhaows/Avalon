"""
WeChat OAuth service for WeChat login.
"""
import requests
from typing import Dict, Optional, Tuple
from dataclasses import dataclass

from .logger import api_logger as logger
from .config import (
    WECHAT_APP_ID, 
    WECHAT_APP_SECRET, 
    WECHAT_REDIRECT_URI,
    WECHAT_MP_APP_ID,
    WECHAT_MP_APP_SECRET
)


@dataclass
class WeChatUserInfo:
    """微信用户信息"""
    openid: str
    unionid: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    sex: Optional[int] = None
    province: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None


class WeChatService:
    """微信服务"""
    
    # 微信开放平台接口
    OAUTH_URL = "https://open.weixin.qq.com/connect/qrconnect"
    ACCESS_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token"
    USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo"
    
    # 微信小程序接口
    MP_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"
    
    def __init__(self):
        self.app_id = WECHAT_APP_ID
        self.app_secret = WECHAT_APP_SECRET
        self.redirect_uri = WECHAT_REDIRECT_URI
        self.mp_app_id = WECHAT_MP_APP_ID
        self.mp_app_secret = WECHAT_MP_APP_SECRET
    
    def get_oauth_url(self, state: str = "") -> str:
        """
        获取微信扫码登录URL（网页应用）
        state: 用于防止CSRF攻击的随机字符串
        """
        params = {
            "appid": self.app_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "snsapi_login",
            "state": state
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.OAUTH_URL}?{query}#wechat_redirect"
    
    def get_user_by_code(self, code: str) -> Tuple[Optional[WeChatUserInfo], str]:
        """
        通过授权码获取用户信息（网页/APP）
        返回: (user_info, error_message)
        """
        # 1. 通过code获取access_token
        access_token, openid, error = self._get_access_token(code)
        if error:
            return None, error
        
        # 2. 获取用户信息
        user_info, error = self._get_user_info(access_token, openid)
        if error:
            return None, error
        
        return user_info, ""
    
    def _get_access_token(self, code: str) -> Tuple[Optional[str], Optional[str], str]:
        """获取access_token"""
        try:
            params = {
                "appid": self.app_id,
                "secret": self.app_secret,
                "code": code,
                "grant_type": "authorization_code"
            }
            response = requests.get(self.ACCESS_TOKEN_URL, params=params, timeout=10)
            data = response.json()
            
            if "errcode" in data:
                logger.error(f"获取access_token失败: {data}")
                return None, None, f"微信授权失败: {data.get('errmsg', '未知错误')}"
            
            return data.get("access_token"), data.get("openid"), ""
        except Exception as e:
            logger.error(f"获取access_token异常: {e}")
            return None, None, "网络错误，请重试"
    
    def _get_user_info(self, access_token: str, openid: str) -> Tuple[Optional[WeChatUserInfo], str]:
        """获取用户信息"""
        try:
            params = {
                "access_token": access_token,
                "openid": openid,
                "lang": "zh_CN"
            }
            response = requests.get(self.USERINFO_URL, params=params, timeout=10)
            data = response.json()
            
            if "errcode" in data:
                logger.error(f"获取用户信息失败: {data}")
                return None, f"获取用户信息失败: {data.get('errmsg', '未知错误')}"
            
            user_info = WeChatUserInfo(
                openid=data.get("openid"),
                unionid=data.get("unionid"),
                nickname=data.get("nickname"),
                avatar_url=data.get("headimgurl"),
                sex=data.get("sex"),
                province=data.get("province"),
                city=data.get("city"),
                country=data.get("country")
            )
            
            logger.info(f"获取微信用户信息成功: openid={openid[:8]}...")
            return user_info, ""
        except Exception as e:
            logger.error(f"获取用户信息异常: {e}")
            return None, "网络错误，请重试"
    
    def get_mp_user_by_code(self, code: str) -> Tuple[Optional[WeChatUserInfo], str]:
        """
        通过小程序code获取用户信息
        返回: (user_info, error_message)
        """
        try:
            params = {
                "appid": self.mp_app_id,
                "secret": self.mp_app_secret,
                "js_code": code,
                "grant_type": "authorization_code"
            }
            response = requests.get(self.MP_CODE2SESSION_URL, params=params, timeout=10)
            data = response.json()
            
            if "errcode" in data and data["errcode"] != 0:
                logger.error(f"小程序登录失败: {data}")
                return None, f"小程序登录失败: {data.get('errmsg', '未知错误')}"
            
            user_info = WeChatUserInfo(
                openid=data.get("openid"),
                unionid=data.get("unionid")
            )
            
            logger.info(f"小程序登录成功: openid={user_info.openid[:8]}...")
            return user_info, ""
        except Exception as e:
            logger.error(f"小程序登录异常: {e}")
            return None, "网络错误，请重试"
    
    def decrypt_user_info(self, session_key: str, encrypted_data: str, iv: str) -> Tuple[Optional[Dict], str]:
        """
        解密小程序用户信息
        需要用户授权获取头像昵称等信息时使用
        """
        try:
            import base64
            from Crypto.Cipher import AES
            
            session_key = base64.b64decode(session_key)
            encrypted_data = base64.b64decode(encrypted_data)
            iv = base64.b64decode(iv)
            
            cipher = AES.new(session_key, AES.MODE_CBC, iv)
            decrypted = cipher.decrypt(encrypted_data)
            
            # 去除补位字符
            pad = decrypted[-1]
            decrypted = decrypted[:-pad]
            
            import json
            return json.loads(decrypted.decode('utf-8')), ""
        except ImportError:
            logger.error("请安装pycryptodome: pip install pycryptodome")
            return None, "服务器配置错误"
        except Exception as e:
            logger.error(f"解密用户信息失败: {e}")
            return None, "解密失败"


# 全局微信服务实例
wechat_service = WeChatService()
