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

from autogen_ext.models.openai import AzureOpenAIChatCompletionClient
from autogen_agentchat.teams import Swarm
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_core.model_context import UnboundedChatCompletionContext
from autogen_core.models import LLMMessage, UserMessage
from autogen_agentchat.messages import HandoffMessage

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
选队长：初始随机指定，之后按左手顺序轮流接任。
组队投票：队长按本轮任务人数组队（可含自己），全员投票，过半同意则组队成功；否则换队长重组。
强制规则：连续 4 次组队失败，第 5 任队长可强制组队执行任务。
执行任务：队员秘密出票，好人仅能出成功票，坏人可自由选择成功 / 失败票；队长洗牌后亮票，按失败票要求判定任务成败。
三、终局刺杀规则
触发条件：好人方率先完成 3 次任务。
操作流程：全员禁言，坏人方（不含奥伯伦）私下协商，指认 1 名玩家为梅林。
胜负判定：指认对象为梅林→坏人方胜利；指认为其他角色→好人方胜利。
"""

PLAYER_PROMPT_TEMPLATE = """
    你是一个7人阿瓦隆游戏的玩家。游戏规则如下：
    {avalon_rules}
    请根据上述规则，扮演一个玩家的角色，参与游戏并做出决策。
    所有的游戏玩家是：{all_players}。
    你的名字是：{player_name}。
    你的角色是：{role}。
    请根据你的角色和游戏进程，做出合理的决策和行动，你的目标是帮助你的阵营获胜。
    你的可能行动如下：
    1. 发言时，直接输出发言结果，不要输出内心想法，请注意不要暴露你的真实身份和信息, 可以适当误导其他玩家, 以保护你的阵营利益, 注意你的发言其他玩家都能看到。发言时不需要投票
    2. 投票队长提议的队伍时，你可以根据你的阵营利益，选择支持或反对队长提议的队伍, 你的投票其他玩家看不到。以<我的投票是: xxxx>的格式告诉主持人你的投票选择。发言与投票不同时进行
    3. 投票做任务时，你可以根据你的阵营利益，选择出成功票或失败票, 你的投票选择其他玩家看不到。以<我的投票是: xxxx>的格式告诉主持人你的投票选择。发言与投票不同时进行
    4. 当主持人把你分配为队长时，你需要选择合适的队员组队，并说服其他玩家投票通过你的队伍。
    5. 你只需要完成主持人交给你的任务，任务完成后转交给主持人。
    说明：你的发言偏向可能与投票和任务选择不一致，因为发言可以迷惑对手, 不能简单根据游戏玩家的发言来决定你的投票和任务选择。
    你的人设是：{personality}。

    根据你的角色-{role}, 你的角色能提前获取以下信息，请充分利用该信息进行游戏：
    {info}
    你的角色的注意事项是：{role_notes}

    ## 注意事项
    1. 发言/投票/做任务后必须handoff给Host, 不要输出"handoff to xxxxx"内容
"""

HOST_PROMPT_TEMPLATE = """
    你是阿瓦隆游戏的主持人。游戏规则如下：
    {avalon_rules}
    你的任务是组织和引导游戏进程，确保所有玩家遵守规则。
    你需要根据游戏进程，向玩家提供必要的信息和提示。
    你需要在游戏过程中，适时总结和回顾游戏进展。
    你需要在游戏结束时，宣布胜利阵营并总结游戏亮点。
    初始随机选择队长, 不要老选player1作为初始队长。
    选定队长组队后，需要先由玩家发言后, 发言顺序为由队长开始，按顺时针方向依次发言，再进行投票表决
    不要把玩家的投票信息和执行任务的结果透露给其他玩家。玩家回复后，表示感谢就行，不用总结。
    投票结束时，需要总结有几票同意，几票反对, 几张失败票, 几张成功票, 并宣布任务结果。
    投票、发言、执行任务等环节需要你来组织和引导, 把任务交给对应的玩家即可，然后玩家把相应的结果交给你。
    流程是队长组队->所有玩家发言->所有玩家投票->执行任务->公布结果->下一个队长组队, 依次循环直到游戏结束。
    玩家的发言与投票结果可能不一致, 不能简单根据发言来判断玩家的投票, 需要玩家明确完成投票动作。
    在发言时，请注意保持中立和客观，不偏袒任何一方, 也不要透露任何玩家的身份信息。
    游戏结束时, 输出terminate。

    游戏信息如下：
    {game_info}

    ## 输出格式要求
    你的每次输出必须以JSON格式开头，用```json和```包裹，然后是你要对玩家说的话。示例:
    ```json
    {{
        "phase": "team_select",
        "mission_round": 1,
        "captain": "玩家名",
        "team_members": ["玩家1", "玩家2"],
        "mission_success_count": 0,
        "mission_fail_count": 0,
        "reject_count": 0,
        "next_player": "下一个玩家名"
    }}
    ```
    你要对玩家说的话...

    各字段说明:
    - phase: 当前游戏阶段，可选值: "team_select"(队长选人), "speaking"(发言阶段), "voting"(投票阶段), "mission"(执行任务), "assassinate"(刺杀阶段), "game_over"(游戏结束)
    - mission_round: 当前是第几轮任务 (1-5)
    - captain: 当前队长的名字
    - team_members: 当前被选中的队员名字列表，未选择时为空数组[]
    - mission_success_count: 目前成功的任务数量
    - mission_fail_count: 目前失败的任务数量  
    - reject_count: 当前轮连续被否决的次数 (0-4)
    - next_player: 下一个需要发言/行动的玩家名字

    ## 注意事项
    1. 发言后必须handoff给对应玩家，等待玩家回复。不要输出"handoff to xxxxx"内容
"""

# Role configurations for knowledge
ROLE_CONFIG = {
    "梅林": {
        "team": "good",
        "personality": "聪明且谨慎, 发言时注意迷惑对方阵营, 不要暴露出你是梅林",
        "role_notes": "隐藏身份，避免被刺杀"
    },
    "派西维尔": {
        "team": "good",
        "personality": "机智且善于观察, 注意保护梅林",
        "role_notes": "识别真假梅林，保护真正的梅林"
    },
    "忠臣": {
        "team": "good",
        "personality": "忠诚且勇敢",
        "role_notes": "无"
    },
    "刺客": {
        "team": "evil",
        "personality": "狡猾且有野心",
        "role_notes": "在游戏结束时刺杀梅林以帮助坏人阵营获胜"
    },
    "莫甘娜": {
        "team": "evil",
        "personality": "狡诈且富有魅力",
        "role_notes": "伪装成梅林，误导派西维尔"
    },
    "奥伯伦": {
        "team": "evil",
        "personality": "孤独且神秘",
        "role_notes": "孤立坏人，无法与其他坏人互认，需自行辨识队友"
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
            model="gpt-4.1",
            azure_deployment=AZURE_DEPLOYMENT,
            api_version=API_VERSION,
            parallel_tool_calls=False,
        )
    
    async def broadcast(self, msg_type: str, content: Any, player_id: str = None, player_name: str = None):
        """Broadcast a message to all connected clients."""
        print(f"[GameEngine] Broadcasting: type={msg_type}, player_name={player_name}")
        message = GameMessage(
            type=msg_type,
            player_id=player_id,
            player_name=player_name,
            content=content,
            timestamp=datetime.now()
        )
        if self.message_callback:
            await self.message_callback(message)
            print(f"[GameEngine] Broadcast sent successfully")
        else:
            print(f"[GameEngine] WARNING: No message_callback set!")
    
    def _assign_roles(self):
        """Randomly assign roles to players and set up name mappings."""
        roles = SEVEN_PLAYER_ROLES.copy()
        random.shuffle(roles)
        
        for i, player in enumerate(self.room.players):
            role = roles[i]
            # 使用Python标识符作为agent_name
            player.agent_name = f"player_{i + 1}"
            # display_name 直接使用 player.name（room_manager 已经设置好了正确的名字）
            player.display_name = player.name
            
            self.roles_assignment[player.display_name] = role
            player.role = Role(role)
        
        # Build players_info with role-specific knowledge
        evil_players = [p.display_name for p in self.room.players 
                       if self.roles_assignment[p.display_name] in ["刺客", "莫甘娜", "奥伯伦"]]
        merlin_player = [p.display_name for p in self.room.players 
                        if self.roles_assignment[p.display_name] == "梅林"][0]
        morgana_player = [p.display_name for p in self.room.players 
                         if self.roles_assignment[p.display_name] == "莫甘娜"][0]
        
        for player in self.room.players:
            role = self.roles_assignment[player.display_name]
            config = ROLE_CONFIG[role]
            
            # Determine role-specific info
            if role == "梅林":
                info = f"知道所有坏人身份, 即{', '.join(evil_players)}是坏人"
            elif role == "派西维尔":
                info = f"知道{merlin_player}和{morgana_player}是梅林和莫甘娜, 但是不知道谁是谁"
            elif role == "刺客":
                other_evil = [e for e in evil_players if e != player.display_name and self.roles_assignment[e] != "奥伯伦"]
                info = f"知道{', '.join(other_evil)}是坏人" if other_evil else "无"
            elif role == "莫甘娜":
                other_evil = [e for e in evil_players if e != player.display_name and self.roles_assignment[e] != "奥伯伦"]
                info = f"知道{', '.join(other_evil)}是坏人" if other_evil else "无"
            elif role == "奥伯伦":
                info = "无"
            else:
                info = "无"
            
            # 使用agent_name作为key
            self.players_info[player.agent_name] = {
                "role": role,
                "display_name": player.display_name,
                "personality": config["personality"],
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
        
        print(f"[GameEngine] Waiting for input from {display_name} ({agent_name}), prompt: {prompt}")
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
        
        print(f"[GameEngine] Broadcast waiting_input sent for {display_name}")
        
        try:
            # Wait for input (with timeout)
            result = await asyncio.wait_for(future, timeout=300)  # 5 minutes timeout
            print(f"[GameEngine] Received input from {display_name}: {result}")
            # 在投票和任务阶段，自动添加前缀以便在Swarm内屏蔽
            if self._current_phase in ("voting", "mission"):
                result = f"<我的投票是: {result}>"
            return result
        except asyncio.TimeoutError:
            print(f"[GameEngine] Timeout waiting for input from {display_name}")
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
                # 在提示词中使用display_name让AI知道自己的显示名
                prompt = PLAYER_PROMPT_TEMPLATE.format(
                    avalon_rules=AVALON_RULES,
                    all_players=display_names,  # 使用显示名列表
                    player_name=display_name,   # 使用显示名
                    role=info["role"],
                    personality=info["personality"],
                    info=info["info"],
                    role_notes=info["role_notes"]
                )
                
                player_context = FilterVoteInfoContext()
                agent = AwalonAssistantAgent(
                    name=agent_name,  # 使用Python标识符
                    handoffs=["Host"],
                    model_client=self.model_client,
                    model_context=player_context,
                    system_message=prompt
                )
            player_agents.append(agent)
        
        # Create host agent - 使用display_name映射让Host知道玩家名字
        # 构建游戏信息，包含agent_name到display_name的映射
        game_info_with_mapping = {
            "roles": self.roles_assignment,
            "name_mapping": {p.agent_name: p.display_name for p in self.room.players}
        }
        host_prompt = HOST_PROMPT_TEMPLATE.format(
            avalon_rules=AVALON_RULES,
            game_info=game_info_with_mapping
        )
        
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
        
        # Assign roles
        self._assign_roles()
        
        # Create agents
        host_agent, player_agents = self._create_agents()
        
        # Create Swarm team
        termination = TextMentionTermination("terminate")
        self.team = Swarm(
            [host_agent] + player_agents,
            termination_condition=termination,
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
            await self.broadcast("role_assigned", {
                "player_id": player.id,
                "player_name": player.display_name,  # 使用display_name
                "role": info["role"],
                "team": ROLE_CONFIG[info["role"]]["team"],
                "info": info["info"]
            }, player.id, player.display_name)
        
        # Run the game stream
        try:
            stream = self.team.run_stream(task="游戏开始")
            async for message in stream:
                try:
                    source = getattr(message, 'source', 'system')
                    content = getattr(message, 'content', str(message))
                    if source == 'user':
                        continue  # Skip autogen user messages
                    
                    # Skip transfer messages or non-string content
                    if not isinstance(content, str):
                        continue
                    if 'ransfer' in content:
                        continue
                    
                    # 判断source是否是人类用户 (agent_name) - 先处理同步信号
                    if source in self.human_players and (not content.strip()):
                        print(f"[GameEngine] Human player sync message from {source}")
                        future = self._user_input_sync.get(source)
                        if future and not future.done():
                            future.set_result('sync')
                    
                    # 跳过空消息
                    if not content.strip():
                        continue
                    
                    # 设置用于显示的内容和来源
                    display_content = content
                    display_source = source
                    
                    # 处理Host的输出 - 解析JSON状态
                    if source == "Host":
                        game_state, message_text = self._parse_host_output(content)
                        if game_state:
                            # 更新当前阶段
                            if "phase" in game_state:
                                self._current_phase = game_state["phase"]
                            # 广播游戏状态更新
                            await self.broadcast("game_state_update", game_state)
                        # 使用解析后的消息文本，或者原始内容
                        display_content = message_text if message_text else content
                    else:
                        # 将agent_name转换为display_name用于显示
                        player = self._get_player_by_agent_name(source)
                        if player:
                            display_source = player.display_name
                        # 在投票和任务阶段，屏蔽玩家的发言内容
                        if self._current_phase in ("voting", "mission"):
                            display_content = "[投票已提交]"

                    # Broadcast message - 使用display_source而不是agent_name
                    await self.broadcast("game_message", {
                        "source": display_source,
                        "content": display_content,
                    }, None, display_source)

                    # Check for game end
                    if "terminate" in content.lower():
                        self.is_running = False
                        self.room.game_state.phase = GamePhase.GAME_OVER
                        await self.broadcast("game_over", {
                            "message": "游戏结束",
                            "roles": self.roles_assignment
                        })
                        break
                    # sleep 根据display_content长度调整
                    sleep_time = min(max(len(display_content) / 20.0, 0.5), 8.0)
                    await asyncio.sleep(sleep_time)
                        
                except Exception as e:
                    print(f'Error processing message: {e}')
                    
        except Exception as e:
            print(f'Error during game: {e}')
            await self.broadcast("error", {"message": str(e)})
        finally:
            self.is_running = False
    
    def _parse_host_output(self, content: str) -> Tuple[Optional[dict], str]:
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
                print(f"[GameEngine] Failed to parse JSON from Host output: {e}")
        
        return game_state, message_text
    
    def get_player_role_info(self, player_id: str) -> Optional[dict]:
        """Get role info for a specific player."""
        for player in self.room.players:
            if player.id == player_id:
                agent_name = player.agent_name
                info = self.players_info.get(agent_name)
                if info:
                    return {
                        "role": info["role"],
                        "display_name": info["display_name"],
                        "team": ROLE_CONFIG[info["role"]]["team"],
                        "info": info["info"],
                        "role_notes": info["role_notes"]
                    }
        return None
