"""
Game Engine for Avalon - Using Swarm team from avalon.py
Directly uses AutoGen Swarm to run the game, streaming messages to frontend.
"""
import asyncio
import json
import random
import re
from typing import Dict, List, Optional, Callable, Any, Tuple
from datetime import datetime

from autogen_ext.models.openai import AzureOpenAIChatCompletionClient, OpenAIChatCompletionClient
from autogen_agentchat.teams import Swarm
from autogen_agentchat.conditions import TextMentionTermination, ExternalTermination
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_core.model_context import UnboundedChatCompletionContext
from autogen_core.models import LLMMessage, UserMessage
from autogen_agentchat.messages import HandoffMessage

from .logger import game_logger as logger
from .models import (
    Role, Team, GamePhase, PlayerType, PlayerInfo,
    RoomInfo, GameMessage
)
from .config import AZURE_API_KEY, AZURE_ENDPOINT, AZURE_DEPLOYMENT, API_VERSION
from pydantic import BaseModel
from typing import Literal


# Host输出格式模型
class HostOutput(BaseModel):
    """主持人的结构化输出格式"""
    # 当前游戏阶段
    phase: Literal["team_select", "speaking", "voting", "mission", "assassinate", "game_over"]
    # 当前任务轮次 (1-5)
    mission_round: int
    # 当前队长的display_name
    captain: Optional[str] = None
    # 当前被选中的队员列表 (display_name)
    team_members: Optional[List[str]] = None
    # 任务结果: 成功次数
    mission_success_count: int = 0
    # 任务结果: 失败次数
    mission_fail_count: int = 0
    # 当前轮连续拒绝次数
    reject_count: int = 0
    # 下一个要发言/行动的玩家 (display_name)
    next_player: Optional[str] = None
    # 主持人的发言内容
    message: str


# Game rules - same as avalon.py
AVALON_RULES = """
    7人阿瓦隆游戏规则
    核心定位: 7人阵营推理桌游, 分为好人方(4 人)与坏人方(3 人)，通过任务成败博弈 + 终局刺杀决定胜负，全程无玩家出局，侧重逻辑推理与身份伪装。
    一、阵营与角色配置（固定）
    好人方(蓝方)4 人
    梅林：知晓所有坏人身份，需隐藏自身以防被刺杀。
    派西维尔：能看到梅林与莫甘娜，需自行分辨真假梅林，引导好人阵营。
    忠臣x2: 无特殊技能, 仅需配合队友完成任务、掩护核心角色。
    核心目标：完成 3 次任务，且终局保护梅林不被刺杀。
    坏人方(红方)3 人
    刺客：终局阶段负责刺杀梅林。
    莫甘娜：伪装梅林误导派西维尔。
    奥伯伦：孤立坏人，无法与其他坏人互认，需自行辨识队友。
    核心目标：搞砸 3 次任务直接胜利；或好人完成 3 次任务后，精准刺杀梅林逆转获胜。
    阵营互通规则：坏人仅奥伯伦与队友互不见面，其余坏人开局互认；好人仅梅林、派西维尔有特殊信息，其余互不确认身份。
    二、任务轮次与关键规则（核心）
    1. 任务人数与失败判定（固定）
    轮次	任务人数	失败票要求
    1	2 人	1 张失败票 = 任务失败
    2	3 人	1 张失败票 = 任务失败
    3	3 人	1 张失败票 = 任务失败
    4	4 人	2 张失败票 = 任务失败（特殊保护轮）
    5	4 人	1 张失败票 = 任务失败
    游戏率先达成 3 胜 / 3 负直接结束，无需进行全部 5 轮。
    2. 单轮游戏流程
    选队长：初始随机指定，之后按顺时针顺序轮流接任。
    组队投票：队长按本轮任务人数组队（可含自己），全员投票，过半同意则组队成功；否则更换队长重新组队。
    强制规则：连续 4 次组队失败，第 5 任队长可强制组队执行任务。
    执行任务：队员秘密出票，好人仅能出成功票，坏人可自由选择成功 / 失败票；队长洗牌后亮票，按失败票要求判定任务成败。
    三、终局刺杀规则
    触发条件：好人方率先完成 3 次任务。
    操作流程：全员禁言，坏人方（不含奥伯伦）私下协商，指认 1 名玩家为梅林。
    胜负判定：指认对象为梅林→坏人方胜利；指认为其他角色→好人方胜利。
"""

PLAYER_PROMPT_TEMPLATE = """
## 身份设定
你是「{agent_name}」，一名阿瓦隆游戏玩家。
- 角色：{role}
- 阵营：{team_display}
- 性格特点：{personality}

## 你的情报
{info}
角色要点：{role_notes}

## 游戏规则摘要
{avalon_rules}

## 玩家列表
{player_list}

## 行动指南

### 核心策略
1. **信息收集**：关注每位玩家的发言内容、组队偏好；分析每一轮的任务结果和投票情况，积累线索
2. **逻辑推理**：根据任务成败、投票记录、发言内容推断可疑玩家,投票是要根据自己的推理来决定
3. **身份伪装**：适时假装某角色或透露部分信息引导局势
4. **阵营配合**：好人找队友完成任务，坏人制造分歧破坏任务
5. **核心要点**：每一轮好人都需要尽量保证任务成功，坏人则需要尽量搞砸任务

### 发言阶段
- 基于已知信息和局势推理，给出你的判断；不能编造事实或盲目发言；发言阶段只是交流观点，不涉及投票和任务选择
- 直接表达观点，可质疑或支持他人，但用事实依据支撑
- 用你的性格特点来表达
- 好人重点：推理找坏人，梅林隐藏身份
- 坏人重点：伪装身份，制造分歧

### 投票阶段（队伍投票/任务投票）
- 格式：我的投票是: 同意/反对 或 我的投票是: 成功/失败
- 投票是秘密的，可以与发言立场不一致
- 组队投票时：根据已知和推理决定。好人反对含有可疑坏人的队伍；坏人反对不含队友的队伍
- 做任务时，好人一般只出成功票；坏人需要投出失败票来破坏任务，但是也可以故意投出成功票来误导大家(谨慎选择)

### 队长组队
- 根据本轮任务人数选择队员
- 说明选人理由，争取其他玩家支持

## 输出要求
1. 只输出当前任务的内容（发言/投票/组队）
2. 发言要简洁有力，2-4句话为宜
3. 体现你的性格特点
4. 必须回复Host交给你任务, 回复后才能交还主持人，不要说"handoff"
"""

HOST_PROMPT_TEMPLATE = """
    ## 角色定位
    你是阿瓦隆游戏的主持人，负责组织和引导7人游戏进程。

    ## 游戏规则
    {avalon_rules}

    ## 玩家信息
    {game_info}

    **重要说明：**
    - 使用玩家名（如 player_1）与玩家交流
    - 角色信息仅供你控制游戏流程（如找刺客执行刺杀），绝不可在对话中透露任何玩家的角色

    ## 核心职责
    1. **流程控制**：严格按照 队长组队→全员发言→全员投票(必须有这个过程，即使玩家在发言阶段表达了投票意图，也需要重新投票)→执行任务→公布结果 的顺序进行
    2. **信息保密**：绝不透露玩家角色、投票详情、任务出票情况
    3. **中立客观**：不偏袒任何阵营，不暗示任何玩家身份
    4. **节奏把控**：简洁引导，玩家回复后简单确认即可，不做冗余总结

    ## 游戏流程

    ### 开局
    - 随机选择首任队长（不要总选第一个玩家）
    - 宣布第一轮任务需要的人数

    ### 每轮流程
    1. **队长组队** (phase: team_select)
    - 提示队长选择本轮所需人数的队员
    
    2. **全员发言** (phase: speaking)
    - 从队长开始，按座位号递增顺序依次发言（到7号后循环回1号）例如：队长座位号是3，则发言顺序为 3→4→5→6→7→1→2
    - 每位玩家发言后继续下一位，直到全部7人发言完毕
    
    3. **全员投票** (phase: voting)
    - 从队长开始，按座位号递增顺序依次投票（到7号后循环回1号）例如：队长座位号是3，则投票顺序为 3→4→5→6→7→1→2
    - 每次只让一位玩家投票(同意/反对)，不要透露玩家的投票结果，玩家投票格式为：我的投票是: 同意/反对
    - 全部7人投票结束后，必须总结投票结果：X票同意，X票反对，组队成功/失败
    
    4. **执行任务** (phase: mission)
    - 仅队员参与，按座位号递增顺序依次收集任务票（成功/失败），不要透露玩家的任务票, 玩家投票格式为：我的投票是: 成功/失败
    - 任务结束后只公布：X张成功票，X张失败票，任务成功/失败
    
    5. **轮次结算**
    - 更新比分，检查是否达成3胜/3负
    - 未结束则轮换队长，开始下一轮

    ### 终局刺杀 (phase: assassinate)
    - 好人3胜后触发
    - 让刺客指认梅林
    - 公布刺杀结果和最终胜负

    ### 游戏结束 (phase: game_over)
    - 宣布获胜阵营
    - 公布所有玩家角色
    - 输出 terminate

    ## 输出格式（必须严格遵守）

    ```json
    {{
        "phase": "team_select|speaking|voting|mission|assassinate|game_over",
        "mission_round": 当前轮次,
        "captain": "队长名",
        "all_players": ["玩家1", "玩家2", "玩家3", "玩家4", "玩家5", "玩家6", "玩家7"],
        "vote_info": {{"玩家1": "同意/反对", "玩家2": "同意/反对", ...}},  # 仅在voting阶段包含
        "task_info": {{"玩家1": "成功/失败", "玩家2": "成功/失败", ...}},  # 仅在mission阶段包含
        "team_members": ["队员1", "队员2"],
        "mission_success_count": 成功任务数,
        "mission_fail_count": 失败任务数,
        "reject_count": 连续否决次数,
        "next_player": "下一个行动的玩家名"
    }}
    ```
    然后是你对玩家说的话（简洁明了, 表述清楚任务, 仅提及当前玩家，不要提前规划，不能省略）。

    **phase字段必须是以下值之一：**
    - `team_select`: 队长组队阶段
    - `speaking`: 全员发言阶段
    - `voting`: 全员投票阶段（投票是否同意组队）
    - `mission`: 执行任务阶段（队员出成功/失败票）
    - `assassinate`: 终局刺杀阶段
    - `game_over`: 游戏结束
    注意：当前阶段完后后，当你进行总结时就及时更新phase字段到下一阶段，避免next_player的操作指向错误phase


    ## 注意事项
    - 必须完成引导总结后，才能交给对应玩家，并向玩家清晰的说明任务，不要说"handoff"
    - 发言简洁，避免重复总结玩家已说过的内容
    - 关注游戏规则、保持游戏节奏流畅
"""

# 玩家人设列表（随机分配给玩家，与角色无关）
PERSONALITY_LIST = [
    "沉稳冷静，善于分析，发言简洁有力",
    "热情活跃，喜欢带动气氛，善于引导话题",
    "谨慎多疑，喜欢质疑他人，观察力强",
    "直来直去，说话直接，不喜欢绕弯子",
    "幽默风趣，喜欢用轻松的方式表达观点",
    "沉默寡言，只在关键时刻发表意见",
    "老谋深算，喜欢设置陷阱试探他人",
    "情绪化，容易被他人发言影响",
    "自信满满，喜欢主导讨论方向",
    "圆滑世故，善于调和各方矛盾"
]

# Role configurations for knowledge（仅包含阵营和角色说明）
ROLE_CONFIG = {
    "梅林": {
        "team": "good",
        "role_notes": "你知道所有坏人身份，但要隐藏自己避免被刺杀"
    },
    "派西维尔": {
        "team": "good",
        "role_notes": "你能看到梅林和莫甘娜，需识别真假梅林并保护真正的梅林"
    },
    "忠臣": {
        "team": "good",
        "role_notes": "你没有特殊信息，需通过推理找出坏人"
    },
    "刺客": {
        "team": "evil",
        "role_notes": "游戏结束时负责刺杀梅林，刺中则坏人逆转获胜"
    },
    "莫甘娜": {
        "team": "evil",
        "role_notes": "你会被派西维尔看到，可伪装成梅林误导好人"
    },
    "奥伯伦": {
        "team": "evil",
        "role_notes": "你与其他坏人互不相识，需自行辨识队友"
    }
}

# 7-player role distribution
SEVEN_PLAYER_ROLES = ["梅林", "派西维尔", "忠臣", "忠臣", "刺客", "莫甘娜", "奥伯伦"]

class AwalonAssistantAgent(AssistantAgent):
    """Custom AssistantAgent for Avalon game."""

    @staticmethod
    async def _add_messages_to_context(
        model_context,
        messages,
    ) -> None:
        """Add incoming messages to the model context."""
        for msg in messages:
            if isinstance(msg, HandoffMessage):
                for llm_msg in msg.context:
                    await model_context.add_message(llm_msg)
            await model_context.add_message(msg.to_model_message())


class FilterVoteInfoContext(UnboundedChatCompletionContext):
    """A model context that filters out vote information from other players."""

    async def get_messages(self) -> List[LLMMessage]:
        messages = await super().get_messages()
        messages_out: List[LLMMessage] = []
        
        roles_to_hide = ["梅林", "派西维尔", "忠臣", "刺客", "莫甘娜", "奥伯伦"]
        
        for message_item in messages:
            message = message_item.model_copy()
            if isinstance(message, UserMessage):
                # Hide role names
                for role in roles_to_hide:
                    if message.content and isinstance(message.content, str):
                        message.content = message.content.replace(role, "***")
                # Hide vote information from other players
                if message.source != "Host":
                    if message.content and "我的投票是" in message.content:
                        message.content = "[内容已隐藏]"
                if message.content:
                    _, message.content = GameEngine._parse_host_output(message.content)
            # filter transfer messages 
            # if message and message.content and isinstance(message.content, list):
            #     continue
            # if message and message.content and message.content.startswith("Transferred to"):
            #     continue
            # if message and hasattr(message, "content") and isinstance(message.content, str):
            #     _, message.content = GameEngine._parse_host_output(message.content)
            messages_out.append(message)
        return messages_out


class GameEngine:
    """
    Game Engine that wraps AutoGen Swarm team.
    Uses team.run_stream() to get messages and broadcast to frontend.
    Supports human players via UserProxyAgent with WebSocket input.
    """
    
    def __init__(self, room: RoomInfo, message_callback: Callable[[GameMessage], Any] = None,
                 human_input_callback: Callable[[str], Any] = None):
        self.room = room
        self.message_callback = message_callback
        self.human_input_callback = human_input_callback  # Async function to get human input
        self.team = None
        self.is_running = False
        self.external_termination = None  # 用于手动终止游戏
        self.players_info: Dict[str, dict] = {}  # agent_name -> player info
        self.roles_assignment: Dict[str, str] = {}  # display_name -> role
        self.human_players: Dict[str, str] = {}  # agent_name -> player_id mapping for human players
        self._pending_input: Dict[str, asyncio.Future] = {}  # agent_name -> Future for pending input
        self._user_input_sync: Dict[str, asyncio.Future] = {}  # agent_name -> Future for sync input
        self._current_phase: str = "team_select"  # 当前游戏阶段
        
        # Create model client
        self.model_client = AzureOpenAIChatCompletionClient(
            api_key=AZURE_API_KEY,
            azure_endpoint=AZURE_ENDPOINT,
            model="gpt-5",
            azure_deployment=AZURE_DEPLOYMENT,
            api_version=API_VERSION,
            parallel_tool_calls=False,
            max_completion_tokens=4096,  # 设置最大输出token数，避免截断
        )
        # self.model_client = OpenAIChatCompletionClient(
        #     model = "deepseek-v3.2",
        #     api_key = "sk-2bfbfa2832074ac4a2f43ff624f597d3",
        #     base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        #     model_info = {
        #         "vision": False,
        #         "function_calling": True,
        #         "json_output": True,
        #         "family": "deepseek",
        #         "structured_output": True,
        #     },
        #     parallel_tool_calls=False,
        #     max_tokens=4096
        # )
        # self.model_client = OpenAIChatCompletionClient(
        #     model = "glm-4.7",
        #     api_key = "sk-2bfbfa2832074ac4a2f43ff624f597d3",
        #     base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        #     model_info = {
        #         "vision": False,
        #         "function_calling": True,
        #         "json_output": True,
        #         "family": "glm",
        #         "structured_output": True,
        #     },
        #     parallel_tool_calls=False,
        #     max_tokens=4096
        # )
        # self.model_client = OpenAIChatCompletionClient(
        #     model = "kimi-k2.5",
        #     api_key = "sk-2bfbfa2832074ac4a2f43ff624f597d3",
        #     base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        #     model_info = {
        #         "vision": False,
        #         "function_calling": True,
        #         "json_output": True,
        #         "family": "kimi",
        #         "structured_output": True,
        #     },
        #     parallel_tool_calls=False,
        #     max_tokens=4096
        # )
    
    async def stop_game(self):
        """手动停止游戏，通过 ExternalTermination 终止 Swarm 任务"""
        if self.external_termination:
            logger.info(f"手动终止游戏: room={self.room.id}")
            self.external_termination.set()
            self.is_running = False
            # 取消所有等待中的人类输入
            for agent_name, future in list(self._pending_input.items()):
                if not future.done():
                    future.cancel()
            self._pending_input.clear()
            for agent_name, future in list(self._user_input_sync.items()):
                if not future.done():
                    future.cancel()
            self._user_input_sync.clear()
    
    async def broadcast(self, msg_type: str, content: Any, player_id: str = None, player_name: str = None):
        """Broadcast a message to all connected clients."""
        logger.debug(f"广播消息: type={msg_type}, player={player_name}")
        message = GameMessage(
            type=msg_type,
            player_id=player_id,
            player_name=player_name,
            content=content,
            timestamp=datetime.now()
        )
        if self.message_callback:
            await self.message_callback(message)
        else:
            logger.warning("未设置message_callback!")
    
    def _assign_roles(self):
        """Randomly assign roles to players and set up name mappings."""
        roles = SEVEN_PLAYER_ROLES.copy()
        random.shuffle(roles)
        
        # 随机分配人设给每个玩家（与角色无关）
        personalities = PERSONALITY_LIST.copy()
        random.shuffle(personalities)
        
        logger.info("开始分配角色...")
        
        personality_index = 0  # 用于AI玩家分配人设的索引
        for i, player in enumerate(self.room.players):
            role = roles[i]
            # 使用Python标识符作为agent_name
            player.agent_name = f"player_{i + 1}"
            # display_name 直接使用 player.name（room_manager 已经设置好了正确的名字）
            player.display_name = player.name
            # 只给AI玩家分配人设，人类玩家不需要
            if player.player_type == PlayerType.AI:
                player.personality = personalities[personality_index % len(personalities)]
                personality_index += 1
            else:
                player.personality = None  # 人类玩家不设置personality
            
            self.roles_assignment[player.display_name] = role
            player.role = Role(role)
            logger.debug(f"角色分配: {player.display_name} -> {role}")
        
        # Build players_info with role-specific knowledge
        # 使用 agent_name 构建情报（提示词中使用agent_name）
        # 首先构建 agent_name -> role 映射
        agent_to_role = {p.agent_name: self.roles_assignment[p.display_name] for p in self.room.players}
        
        evil_players = [p.agent_name for p in self.room.players 
                       if self.roles_assignment[p.display_name] in ["刺客", "莫甘娜", "奥伯伦"]]
        merlin_player = [p.agent_name for p in self.room.players 
                        if self.roles_assignment[p.display_name] == "梅林"][0]
        morgana_player = [p.agent_name for p in self.room.players 
                         if self.roles_assignment[p.display_name] == "莫甘娜"][0]
        
        for player in self.room.players:
            role = self.roles_assignment[player.display_name]
            config = ROLE_CONFIG[role]
            
            # Determine role-specific info（使用agent_name）
            if role == "梅林":
                info = f"知道所有坏人身份, 即{', '.join(evil_players)}是坏人"
            elif role == "派西维尔":
                info = f"知道{merlin_player}和{morgana_player}是梅林和莫甘娜, 但是不知道谁是谁"
            elif role == "刺客":
                # 刺客能看到除奥伯伦外的其他坏人
                other_evil = [e for e in evil_players if e != player.agent_name and agent_to_role[e] != "奥伯伦"]
                info = f"知道{', '.join(other_evil)}是坏人" if other_evil else "无"
            elif role == "莫甘娜":
                # 莫甘娜能看到除奥伯伦外的其他坏人
                other_evil = [e for e in evil_players if e != player.agent_name and agent_to_role[e] != "奥伯伦"]
                info = f"知道{', '.join(other_evil)}是坏人" if other_evil else "无"
            elif role == "奥伯伦":
                info = "无"
            else:
                info = "无"
            
            # 使用agent_name作为key，personality来自玩家而非角色
            self.players_info[player.agent_name] = {
                "role": role,
                "display_name": player.display_name,
                "personality": player.personality,
                "info": info,
                "role_notes": config["role_notes"]
            }
    
    async def _get_human_input(self, agent_name: str, prompt: str = "") -> str:
        """
        Get input from human player via WebSocket.
        Creates a Future and waits for input to be provided via provide_human_input().
        agent_name: Python标识符形式的agent名称
        """
        # 通过agent_name找到对应的player获取display_name
        player = self._get_player_by_agent_name(agent_name)
        display_name = player.display_name if player else agent_name
        
        logger.info(f"等待人类输入: player={display_name}, prompt={prompt[:30]}...")
        # Create a future to wait for input
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        future_sync = loop.create_future()
        self._pending_input[agent_name] = future
        self._user_input_sync[agent_name] = future_sync

        await future_sync  # Wait for sync signal

        # Small delay to ensure frontend has connected (handles page navigation timing)
        await asyncio.sleep(0.5)

        # Notify frontend that we're waiting for input - 使用display_name
        await self.broadcast("waiting_input", {
            "player_name": display_name,  # 发送display_name给前端
            "prompt": prompt
        }, self.human_players.get(agent_name), display_name)
        
        logger.debug(f"已发送waiting_input: player={display_name}")
        
        try:
            # Wait for input (with timeout)
            result = await asyncio.wait_for(future, timeout=300)  # 5 minutes timeout
            logger.info(f"收到人类输入: player={display_name}, content={result[:50]}...")
            # 将人类输入中的 display_name 替换为 agent_name，保持Swarm内一致使用agent_name
            result = self._replace_display_names(result)
            # 在投票和任务阶段，自动添加前缀以便在Swarm内屏蔽
            if self._current_phase in ("voting", "mission"):
                result = f"<我的投票是: {result}>"
            return result
        except asyncio.TimeoutError:
            logger.warning(f"人类输入超时: player={display_name}")
            return "（超时未响应）"
        finally:
            self._pending_input.pop(agent_name, None)
            self._user_input_sync.pop(agent_name, None)
    
    def _get_player_by_agent_name(self, agent_name: str) -> Optional[PlayerInfo]:
        """通过agent_name查找对应的player"""
        for player in self.room.players:
            if player.agent_name == agent_name:
                return player
        return None
    
    def _get_player_by_display_name(self, display_name: str) -> Optional[PlayerInfo]:
        """通过display_name查找对应的player"""
        for player in self.room.players:
            if player.display_name == display_name:
                return player
        return None
    
    def _replace_agent_names(self, text: str) -> str:
        """将文本中的 agent_name 替换为 display_name"""
        result = text
        for player in self.room.players:
            if player.agent_name and player.display_name:
                result = result.replace(player.agent_name, player.display_name)
        return result
    
    def _replace_display_names(self, text: str) -> str:
        """将文本中的 display_name 替换为 agent_name（用于人类玩家输入进入Swarm前）"""
        result = text
        for player in self.room.players:
            if player.agent_name and player.display_name:
                result = result.replace(player.display_name, player.agent_name)
        return result
    
    def _replace_agent_names_in_state(self, state: dict) -> dict:
        """将 game_state 字典中的 agent_name 替换为 display_name"""
        result = {}
        for key, value in state.items():
            if isinstance(value, str):
                result[key] = self._replace_agent_names(value)
            elif isinstance(value, list):
                result[key] = [self._replace_agent_names(v) if isinstance(v, str) else v for v in value]
            elif isinstance(value, dict):
                result[key] = {k: self._replace_agent_names(v) if isinstance(v, str) else v for k, v in value.items()}
            else:
                result[key] = value
        return result
    
    def provide_human_input(self, player_name: str, message: str):
        """
        Provide input for a waiting human player.
        Called when frontend sends user input via WebSocket.
        player_name: 可以是display_name或agent_name
        """
        # 尝试通过display_name查找对应的player
        player = self._get_player_by_display_name(player_name)
        if player:
            agent_name = player.agent_name
        else:
            agent_name = player_name  # 假设传入的就是agent_name
        
        future = self._pending_input.get(agent_name)
        if future and not future.done():
            future.set_result(message)
            return True
        return False
    
    def _create_agents(self) -> tuple:
        """Create player agents and host agent."""
        # 收集所有agent_name用于handoffs，以及display_name用于提示词
        agent_names = [p.agent_name for p in self.room.players]
        display_names = [p.display_name for p in self.room.players]
        player_agents = []
        
        for player in self.room.players:
            agent_name = player.agent_name
            display_name = player.display_name
            info = self.players_info[agent_name]

            # Check if this is a human player
            is_human = player.player_type == PlayerType.HUMAN

            if is_human:
                # Create input function for this specific player (使用agent_name作为key)
                def make_input_func(aname):
                    async def input_func(prompt: str = "", cancellation_token = None) -> str:
                        return await self._get_human_input(aname, prompt)
                    return input_func

                # Use UserProxyAgent for human players, name使用Python标识符
                agent = UserProxyAgent(
                    name=agent_name,
                    input_func=make_input_func(agent_name)
                )
                self.human_players[agent_name] = player.id
            else:
                # Use AI agent for AI players
                # 计算阵营显示名称
                team_display = "好人方（蓝方）" if info["role"] in ["梅林", "派西维尔", "忠臣"] else "坏人方（红方）"
                # 构建玩家列表（仅使用agent_name）
                player_list_str = "\n".join([f"- {p.agent_name}（座位{p.seat}）" for p in self.room.players])
                # 在提示词中直接使用agent_name
                prompt = PLAYER_PROMPT_TEMPLATE.format(
                    avalon_rules=AVALON_RULES,
                    player_list=player_list_str,  # 玩家列表
                    agent_name=agent_name,        # 使用agent_name
                    role=info["role"],
                    team_display=team_display,    # 阵营显示
                    personality=info["personality"],
                    info=info["info"],
                    role_notes=info["role_notes"]
                )
                # 日志记录AI玩家提示词
                logger.info(f"[PROMPT][{agent_name}({display_name})]:\n{prompt}, prompt length={len(prompt)}")

                player_context = FilterVoteInfoContext()
                agent = AwalonAssistantAgent(
                    name=agent_name,  # 使用Python标识符
                    handoffs=["Host"],
                    model_client=self.model_client,
                    model_context=player_context,
                    system_message=prompt
                )
            player_agents.append(agent)
        
        # Create host agent - 直接使用agent_name
        # 构建玩家信息表，格式化为易读的表格
        player_table_lines = ["| 座位号 | 玩家名 | 角色(仅供流程控制) |", "| --- | --- | --- |"]
        for p in self.room.players:
            role = self.roles_assignment[p.display_name]
            player_table_lines.append(f"| {p.seat} | {p.agent_name} | {role} |")
        player_table = "\n".join(player_table_lines)
        
        host_prompt = HOST_PROMPT_TEMPLATE.format(
            avalon_rules=AVALON_RULES,
            game_info=player_table
        )
        # 日志记录Host提示词
        logger.info(f"[PROMPT][Host]:\n{host_prompt}, prompt length={len(host_prompt)}")

        host_agent = AwalonAssistantAgent(
            name="Host",
            handoffs=agent_names,  # 使用agent_name列表
            model_client=self.model_client,
            system_message=host_prompt,
        )

        return host_agent, player_agents
    
    async def start_game(self):
        """Start the game using Swarm team."""
        if len(self.room.players) != 7:
            raise ValueError("需要7名玩家才能开始游戏")
        
        logger.info(f"游戏开始: room={self.room.id}, players={[p.name for p in self.room.players]}")
        
        # Assign roles
        self._assign_roles()
        logger.info(f"角色分配完成: {self.roles_assignment}")
        
        # Create agents
        host_agent, player_agents = self._create_agents()
        
        # Create Swarm team
        terminate_termination = TextMentionTermination("terminate")
        self.external_termination = ExternalTermination()
        self.team = Swarm(
            [host_agent] + player_agents,
            termination_condition= terminate_termination | self.external_termination,
            max_turns=500,
        )
        
        self.is_running = True
        self.room.game_state.phase = GamePhase.ROLE_ASSIGN
        
        # Broadcast game start with role info for each player
        await self.broadcast("game_start", {
            "message": "游戏开始！角色已分配",
            "players": [
                {
                    "id": p.id,
                    "name": p.display_name,  # 使用display_name
                    "seat": p.seat,
                    "player_type": p.player_type.value
                }
                for p in self.room.players
            ]
        })
        
        # Send role info to each player (will be filtered by frontend per player)
        for player in self.room.players:
            info = self.players_info[player.agent_name]
            # 将 info 中的 agent_name 替换为 display_name 用于前端展示
            display_info = self._replace_agent_names(info["info"])
            await self.broadcast("role_assigned", {
                "player_id": player.id,
                "player_name": player.display_name,  # 使用display_name
                "role": info["role"],
                "team": ROLE_CONFIG[info["role"]]["team"],
                "info": display_info,  # 使用替换后的 info
                "personality": info["personality"]  # 玩家人设
            }, player.id, player.display_name)
        
        # Run the game stream
        try:
            stream = self.team.run_stream(task="游戏开始")
            async for message in stream:
                try:
                    source = getattr(message, 'source', 'system')
                    content = getattr(message, 'content', str(message))
                    logger.info(f"游戏消息: [{source}] {str(content)}")
                    
                    if source == 'user':
                        continue  # Skip autogen user messages
                    
                    # Skip transfer messages or non-string content
                    if not isinstance(content, str):
                        continue
                    if 'ransfer' in content:
                        continue
                    
                    # 判断source是否是人类用户 (agent_name) - 先处理同步信号
                    if source in self.human_players and (not content.strip()):
                        logger.debug(f"人类玩家同步消息: {source}")
                        future = self._user_input_sync.get(source)
                        if future and not future.done():
                            future.set_result('sync')
                    
                    # 跳过空消息
                    if not content.strip():
                        continue
                    if 'Error' in content or 'Exception' in content:
                        logger.error(f"收到错误消息: [{source}] {content}")
                        continue
                    
                    # 设置用于显示的内容和来源
                    display_content = content
                    display_source = source
                    
                    # 处理Host的输出 - 解析JSON状态
                    if source == "Host":
                        game_state, message_text = GameEngine._parse_host_output(content)
                        if game_state:
                            # 更新当前阶段
                            if "phase" in game_state:
                                self._current_phase = game_state["phase"]
                            # 将 game_state 中的 agent_name 替换为 display_name
                            game_state = self._replace_agent_names_in_state(game_state)
                            # 广播游戏状态更新
                            await self.broadcast("game_state_update", game_state)
                        # 使用解析后的消息文本，或者原始内容
                        display_content = message_text if message_text else content
                        # 将消息内容中的 agent_name 替换为 display_name
                        display_content = self._replace_agent_names(display_content)
                    else:
                        # 将agent_name转换为display_name用于显示
                        player = self._get_player_by_agent_name(source)
                        if player:
                            display_source = player.display_name
                        # 在投票和任务阶段，屏蔽玩家的发言内容
                        if self._current_phase in ("voting", "mission"):
                            display_content = "[投票已提交]"
                        else:
                            # 玩家消息内容中也可能提到其他玩家，进行替换
                            display_content = self._replace_agent_names(display_content)

                    # Broadcast message - 使用display_source而不是agent_name
                    await self.broadcast("game_message", {
                        "source": display_source,
                        "content": display_content,
                    }, None, display_source)

                    # Check for game end
                    if "terminate" in content.lower():
                        self.is_running = False
                        self.room.game_state.phase = GamePhase.GAME_OVER
                        logger.info(f"游戏结束: room={self.room.id}")
                        await self.broadcast("game_over", {
                            "message": "游戏结束",
                            "roles": self.roles_assignment
                        })
                        break
                    # sleep 根据display_content长度调整
                    sleep_time = min(max(len(display_content) / 50.0, 0.5), 8.0)
                    await asyncio.sleep(sleep_time)
                        
                except Exception as e:
                    logger.error(f'消息处理错误: {e}')
                    
        except Exception as e:
            logger.error(f'游戏运行错误: {e}')
            await self.broadcast("error", {"message": str(e)})
        finally:
            # 记录agent上下文及系统提示词长度
            for agent in [host_agent] + player_agents:
                if hasattr(agent, '_model_context'):
                    context_length = len(str(await agent._model_context.get_messages()))
                    logger.info(f"Agent {agent.name} 上下文长度: {context_length} tokens")
                    logger.info(f"Agent {agent.name} 上下文：{await agent._model_context.get_messages()}")
            self.is_running = False
    
    @staticmethod
    def _parse_host_output(content: str) -> Tuple[Optional[dict], str]:
        """
        从Host的输出中解析JSON状态和消息文本。
        返回: (game_state_dict, message_text)
        """
        game_state = None
        message_text = content
        
        # 尝试匹配 ```json ... ``` 格式
        json_match = re.search(r'```json\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            try:
                json_str = json_match.group(1).strip()
                game_state = json.loads(json_str)
                # 提取JSON块之后的文本作为消息
                message_text = content[json_match.end():].strip()
                # 如果JSON前面也有文本，合并
                prefix_text = content[:json_match.start()].strip()
                if prefix_text:
                    message_text = prefix_text + "\n" + message_text if message_text else prefix_text
            except json.JSONDecodeError as e:
                logger.warning(f"Host输出JSON解析失败: {e}")
        
        return game_state, message_text
    
    def get_player_role_info(self, player_id: str) -> Optional[dict]:
        """Get role info for a specific player."""
        for player in self.room.players:
            if player.id == player_id:
                agent_name = player.agent_name
                info = self.players_info.get(agent_name)
                if info:
                    # 将 info 中的 agent_name 替换为 display_name 用于前端展示
                    display_info = self._replace_agent_names(info["info"])
                    return {
                        "role": info["role"],
                        "display_name": info["display_name"],
                        "team": ROLE_CONFIG[info["role"]]["team"],
                        "info": display_info,  # 使用替换后的 info
                        "role_notes": info["role_notes"],
                        "personality": info["personality"]  # 玩家人设
                    }
        return None
