# Avalon Web - 阿瓦隆在线桌游

一个支持 AI 与人类玩家混合对战的阿瓦隆桌游网页应用。

## 项目结构

```
avalon-web/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI 主应用
│   │   ├── config.py       # 配置文件
│   │   ├── models.py       # 数据模型
│   │   ├── game_engine.py  # 游戏引擎（核心逻辑）
│   │   ├── room_manager.py # 房间管理
│   │   └── websocket_manager.py  # WebSocket 管理
│   ├── run.py              # 启动脚本
│   └── requirements.txt    # Python 依赖
│
└── frontend/               # React 前端
    ├── src/
    │   ├── api/            # API 客户端
    │   ├── components/     # UI 组件
    │   ├── pages/          # 页面组件
    │   ├── store/          # Zustand 状态管理
    │   └── types/          # TypeScript 类型定义
    ├── package.json
    └── vite.config.ts
```

## 快速开始

### 1. 启动后端

```bash
cd avalon-web/backend

# 创建虚拟环境（可选）
python -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 配置 Azure OpenAI（可选，复制并修改 .env 文件）
cp .env.example .env
# 编辑 .env 填入你的 Azure OpenAI 密钥

# 启动服务器
python run.py
```

后端将在 http://localhost:8000 启动。

### 2. 启动前端

```bash
cd avalon-web/frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端将在 http://localhost:3000 启动。

## 游戏功能

### 支持的功能
- ✅ 创建/加入游戏房间
- ✅ 添加 AI 玩家（1-6个）
- ✅ 7人阿瓦隆完整规则
- ✅ 实时 WebSocket 通信
- ✅ 角色分配与信息隐藏
- ✅ 队长选人、发言、投票
- ✅ 任务执行
- ✅ 终局刺杀

### 角色配置（7人局）
- **好人阵营（4人）**: 梅林、派西维尔、忠臣×2
- **坏人阵营（3人）**: 刺客、莫甘娜、奥伯伦

### 任务配置
| 轮次 | 人数 | 失败条件 |
|------|------|----------|
| 1 | 2人 | 1张失败票 |
| 2 | 3人 | 1张失败票 |
| 3 | 3人 | 1张失败票 |
| 4 | 4人 | 2张失败票 |
| 5 | 4人 | 1张失败票 |

## API 文档

启动后端后，访问 http://localhost:8000/docs 查看完整的 API 文档。

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/rooms | 获取房间列表 |
| POST | /api/rooms | 创建房间 |
| POST | /api/rooms/{id}/join | 加入房间 |
| POST | /api/rooms/{id}/ai | 添加 AI 玩家 |
| POST | /api/rooms/{id}/start | 开始游戏 |
| GET | /api/rooms/{id}/state | 获取游戏状态 |
| POST | /api/rooms/{id}/team | 队长选人 |
| POST | /api/rooms/{id}/speak | 玩家发言 |
| POST | /api/rooms/{id}/vote | 投票 |
| POST | /api/rooms/{id}/mission | 任务投票 |
| POST | /api/rooms/{id}/assassinate | 刺杀 |

### WebSocket

连接地址: `ws://localhost:8000/ws/{room_id}/{player_id}`

## 技术栈

### 后端
- FastAPI - Web 框架
- WebSocket - 实时通信
- AutoGen - AI Agent 框架
- Azure OpenAI GPT-4.1 - AI 模型

### 前端
- React 18 + TypeScript
- Vite - 构建工具
- Tailwind CSS - 样式
- Zustand - 状态管理
- React Router - 路由

## 配置说明

### Azure OpenAI 配置

在 `backend/.env` 中配置：

```env
AZURE_API_KEY=your_api_key
AZURE_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_DEPLOYMENT=gpt-4.1
API_VERSION=2025-01-01-preview
```

## 开发说明

### 游戏引擎

游戏引擎 (`game_engine.py`) 基于状态机设计：

```
WAITING → ROLE_ASSIGN → TEAM_SELECT → SPEAKING → VOTING → MISSION → ...
                              ↑                      ↓
                              └──────────────────────┘ (投票失败)

MISSION (3次成功) → ASSASSINATE → GAME_OVER
MISSION (3次失败) → GAME_OVER
```

### AI 玩家

AI 玩家基于 AutoGen 框架，使用 Azure OpenAI GPT-4.1 模型。每个 AI 玩家有独立的上下文，会根据角色和游戏进程做出决策。

## License

MIT
