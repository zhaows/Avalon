"""
Application configuration using environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Azure OpenAI Configuration
AZURE_API_KEY = os.getenv("AZURE_API_KEY", "be93af5916324304a1b7a0022dc4d673")
AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "https://wbtz-openai-service.openai.azure.com/")
AZURE_DEPLOYMENT = os.getenv("AZURE_DEPLOYMENT", "gpt-4.1")
API_VERSION = os.getenv("API_VERSION", "2025-01-01-preview")

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# SMS Configuration
# 支持的服务商: 'aliyun', 'tencent', 'mock'（开发模式）
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "mock")
SMS_ACCESS_KEY = os.getenv("SMS_ACCESS_KEY", "")
SMS_SECRET_KEY = os.getenv("SMS_SECRET_KEY", "")
SMS_SIGN_NAME = os.getenv("SMS_SIGN_NAME", "阿瓦隆")  # 短信签名
SMS_TEMPLATE_CODE = os.getenv("SMS_TEMPLATE_CODE", "")  # 短信模板ID

# WeChat Configuration (网页/APP)
WECHAT_APP_ID = os.getenv("WECHAT_APP_ID", "")
WECHAT_APP_SECRET = os.getenv("WECHAT_APP_SECRET", "")
WECHAT_REDIRECT_URI = os.getenv("WECHAT_REDIRECT_URI", "")

# WeChat Mini Program Configuration (小程序)
WECHAT_MP_APP_ID = os.getenv("WECHAT_MP_APP_ID", "")
WECHAT_MP_APP_SECRET = os.getenv("WECHAT_MP_APP_SECRET", "")
