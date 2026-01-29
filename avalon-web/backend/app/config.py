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
