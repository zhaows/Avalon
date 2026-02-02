"""
SMS service for sending verification codes.
Supports multiple SMS providers (Aliyun, Tencent Cloud, etc.)
"""
import random
import string
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import re

from .logger import api_logger as logger
from .config import SMS_PROVIDER, SMS_ACCESS_KEY, SMS_SECRET_KEY, SMS_SIGN_NAME, SMS_TEMPLATE_CODE


class SMSService:
    """短信服务"""
    
    def __init__(self):
        # 内存存储验证码（生产环境应使用Redis）
        self._codes: Dict[str, dict] = {}  # phone -> {code, expires_at, attempts}
        self._rate_limit: Dict[str, datetime] = {}  # phone -> last_send_time
        
        # 验证码配置
        self.code_length = 6
        self.code_expire_minutes = 5
        self.rate_limit_seconds = 60  # 发送间隔限制
        self.max_verify_attempts = 5  # 最大验证尝试次数
    
    def _generate_code(self) -> str:
        """生成随机验证码"""
        return ''.join(random.choices(string.digits, k=self.code_length))
    
    def _validate_phone(self, phone: str) -> bool:
        """验证手机号格式（中国大陆）"""
        pattern = r'^1[3-9]\d{9}$'
        return bool(re.match(pattern, phone))
    
    def _can_send(self, phone: str) -> Tuple[bool, str]:
        """检查是否可以发送（频率限制）"""
        if phone in self._rate_limit:
            last_send = self._rate_limit[phone]
            elapsed = (datetime.now() - last_send).total_seconds()
            if elapsed < self.rate_limit_seconds:
                remaining = int(self.rate_limit_seconds - elapsed)
                return False, f"发送太频繁，请{remaining}秒后重试"
        return True, ""
    
    def send_code(self, phone: str) -> Tuple[bool, str]:
        """
        发送验证码
        返回: (success, message)
        """
        # 验证手机号格式
        if not self._validate_phone(phone):
            return False, "手机号格式不正确"
        
        # 检查发送频率
        can_send, msg = self._can_send(phone)
        if not can_send:
            return False, msg
        
        # 生成验证码
        code = self._generate_code()
        expires_at = datetime.now() + timedelta(minutes=self.code_expire_minutes)
        
        # 存储验证码
        self._codes[phone] = {
            'code': code,
            'expires_at': expires_at,
            'attempts': 0
        }
        self._rate_limit[phone] = datetime.now()
        
        # 发送短信
        success = self._do_send(phone, code)
        
        if success:
            logger.info(f"验证码已发送: phone={phone[-4:].rjust(11, '*')}")
            return True, "验证码已发送"
        else:
            return False, "发送失败，请稍后重试"
    
    def _do_send(self, phone: str, code: str) -> bool:
        """
        实际发送短信
        根据配置的SMS_PROVIDER调用不同的服务商接口
        """
        if SMS_PROVIDER == 'aliyun':
            return self._send_aliyun(phone, code)
        elif SMS_PROVIDER == 'tencent':
            return self._send_tencent(phone, code)
        elif SMS_PROVIDER == 'mock':
            # 开发环境模拟发送
            logger.info(f"[MOCK SMS] phone={phone}, code={code}")
            return True
        else:
            logger.warning(f"未配置短信服务商，使用模拟模式: code={code}")
            return True
    
    def _send_aliyun(self, phone: str, code: str) -> bool:
        """阿里云短信发送"""
        try:
            # 需要安装: pip install alibabacloud_dysmsapi20170525
            from alibabacloud_dysmsapi20170525.client import Client
            from alibabacloud_dysmsapi20170525.models import SendSmsRequest
            from alibabacloud_tea_openapi.models import Config
            
            config = Config(
                access_key_id=SMS_ACCESS_KEY,
                access_key_secret=SMS_SECRET_KEY,
                endpoint='dysmsapi.aliyuncs.com'
            )
            client = Client(config)
            
            request = SendSmsRequest(
                phone_numbers=phone,
                sign_name=SMS_SIGN_NAME,
                template_code=SMS_TEMPLATE_CODE,
                template_param=f'{{"code":"{code}"}}'
            )
            
            response = client.send_sms(request)
            if response.body.code == 'OK':
                return True
            else:
                logger.error(f"阿里云短信发送失败: {response.body.message}")
                return False
        except ImportError:
            logger.error("请安装阿里云SDK: pip install alibabacloud_dysmsapi20170525")
            return False
        except Exception as e:
            logger.error(f"阿里云短信发送异常: {e}")
            return False
    
    def _send_tencent(self, phone: str, code: str) -> bool:
        """腾讯云短信发送"""
        try:
            # 需要安装: pip install tencentcloud-sdk-python
            from tencentcloud.common import credential
            from tencentcloud.sms.v20210111 import sms_client, models
            
            cred = credential.Credential(SMS_ACCESS_KEY, SMS_SECRET_KEY)
            client = sms_client.SmsClient(cred, "ap-guangzhou")
            
            req = models.SendSmsRequest()
            req.SmsSdkAppId = SMS_SIGN_NAME  # 腾讯云用AppId
            req.SignName = SMS_SIGN_NAME
            req.TemplateId = SMS_TEMPLATE_CODE
            req.TemplateParamSet = [code]
            req.PhoneNumberSet = [f"+86{phone}"]
            
            resp = client.SendSms(req)
            if resp.SendStatusSet[0].Code == "Ok":
                return True
            else:
                logger.error(f"腾讯云短信发送失败: {resp.SendStatusSet[0].Message}")
                return False
        except ImportError:
            logger.error("请安装腾讯云SDK: pip install tencentcloud-sdk-python")
            return False
        except Exception as e:
            logger.error(f"腾讯云短信发送异常: {e}")
            return False
    
    def verify_code(self, phone: str, code: str) -> Tuple[bool, str]:
        """
        验证验证码
        返回: (success, message)
        """
        if phone not in self._codes:
            return False, "请先获取验证码"
        
        stored = self._codes[phone]
        
        # 检查过期
        if datetime.now() > stored['expires_at']:
            del self._codes[phone]
            return False, "验证码已过期，请重新获取"
        
        # 检查尝试次数
        if stored['attempts'] >= self.max_verify_attempts:
            del self._codes[phone]
            return False, "验证次数过多，请重新获取验证码"
        
        # 验证码校验
        stored['attempts'] += 1
        if stored['code'] != code:
            remaining = self.max_verify_attempts - stored['attempts']
            return False, f"验证码错误，还剩{remaining}次机会"
        
        # 验证成功，删除验证码
        del self._codes[phone]
        logger.info(f"验证码验证成功: phone={phone[-4:].rjust(11, '*')}")
        return True, "验证成功"
    
    def cleanup_expired(self):
        """清理过期的验证码"""
        now = datetime.now()
        expired_phones = [
            phone for phone, data in self._codes.items()
            if now > data['expires_at']
        ]
        for phone in expired_phones:
            del self._codes[phone]


# 全局短信服务实例
sms_service = SMSService()
