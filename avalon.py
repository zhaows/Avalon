
import asyncio
from autogen_ext.models.openai import AzureOpenAIChatCompletionClient
from autogen_agentchat.teams import Swarm
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_agentchat.teams import Swarm
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_agentchat.conditions import TextMentionTermination
from autogen_core.model_context import BufferedChatCompletionContext
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_core.model_context import UnboundedChatCompletionContext
from autogen_core.models import AssistantMessage, LLMMessage, ModelFamily, UserMessage
from typing import List
from autogen_agentchat.messages import HandoffMessage

# Azure API Key
azure_api_key = 'be93af5916324304a1b7a0022dc4d673'
# Azure Endpoint
azure_endpoint = 'https://wbtz-openai-service.openai.azure.com/'
azure_deployment = 'wb_gpt4o'
api_version = '2024-02-15-preview'

azure_deployment = 'gpt-4.1'
api_version = '2025-01-01-preview'

awalon_rules = """
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

player_prompts = f"""
    你是一个7人阿瓦隆游戏的玩家。游戏规则如下：
    {awalon_rules}
    请根据上述规则，扮演一个玩家的角色，参与游戏并做出决策。
    所有的游戏玩家是：{{all_players}}。
    你的名字是：{{player_name}}。
    你的角色是：{{role}}。
    请根据你的角色和游戏进程，做出合理的决策和行动，你的目标是帮助你的阵营获胜。
    你的可能行动如下：
    1. 发言时，直接输出发言结果，不要输出内心想法，请注意不要暴露你的真实身份和信息, 可以适当误导其他玩家, 以保护你的阵营利益, 注意你的发言其他玩家都能看到。
    2. 投票队长提议的队伍时，你可以根据你的阵营利益，选择支持或反对队长提议的队伍, 你的投票其他玩家看不到。以<我的投票是: xxxx>的格式告诉主持人你的投票选择。发言与投票不同时进行
    3. 投票做任务时，你可以根据你的阵营利益，选择出成功票或失败票, 你的投票选择其他玩家看不到。以<我的投票是: xxxx>的格式告诉主持人你的投票选择。发言与投票不同时进行
    4. 当主持人把你分配为队长时，你需要选择合适的队员组队，并说服其他玩家投票通过你的队伍。
    5. 你只需要完成主持人交给你的任务，任务完成后转交给主持人。
    说明：你的发言偏向可能与投票和任务选择不一致，因为发言可以迷惑对手, 不能简单根据游戏玩家的发言来决定你的投票和任务选择。
    你的人设是：{{personality}}。

    根据你的角色-{{role}}, 你的角色能提前获取以下信息，请充分利用该信息进行游戏：
    {{info}}
    你的角色的注意事项是：{{role_notes}}
"""

# 主持人提示
host_prompt = f"""
    你是阿瓦隆游戏的主持人。游戏规则如下：
    {awalon_rules}
    你的任务是组织和引导游戏进程，确保所有玩家遵守规则。
    你需要根据游戏进程，向玩家提供必要的信息和提示。
    你需要在游戏过程中，适时总结和回顾游戏进展。
    你需要在游戏结束时，宣布胜利阵营并总结游戏亮点。
    初始随机选择队长, 不要老选player1作为初始队长。
    选定队长组队后，需要先由玩家发言后, 发言顺序为由队长开始，按顺时针方向依次发言，再进行投票表决
    不要把玩家的投票信息和执行任务的结果透露给其他玩家。玩家回复后，表示感谢就行，不用总结。
    投票结束时，需要总结有几票同意，几票反对, 几张失败票, 几张成功票, 并宣布任务结果。
    投票、发言、执行任务等环节需要你来组织和引导, 把任务交给对应的玩家即可，然后玩家把相应的结果交给你。
    玩家的发言与投票结果可能不一致, 不能简单根据发言来判断玩家的投票, 需要玩家明确完成投票动作。
    在发言时，请注意保持中立和客观，不偏袒任何一方, 也不要透露任何玩家的身份信息。
    游戏结束时, 输出terminate。

    游戏信息如下：
    {{game_info}}

"""

players = ["player1", "player2", "player3", "player4", "player5", "player6", "player7"]
roles = {
    "player5": "梅林",
    "player1": "派西维尔",
    "player7": "忠臣",
    "player4": "忠臣",
    "player2": "刺客",
    "player6": "莫甘娜",
    "player3": "奥伯伦"
}
players_info = {
    "player5": {"role": "梅林", "personality": "聪明且谨慎, 发言时注意迷惑对方阵营, 不要暴露出你是梅林", "info": "知道除莫德雷德外的所有坏人身份, 即player2、player6和player3是坏人", "role_notes": "隐藏身份，避免被刺杀"},
    "player2": {"role": "刺客", "personality": "狡猾且有野心", "info": "知道player6是坏人", "role_notes": "在游戏结束时刺杀梅林以帮助坏人阵营获胜"},
    "player3": {"role": "奥伯伦", "personality": "孤独且神秘", "info": "无", "role_notes": "孤立坏人，无法与其他坏人互认，需自行辨识队友"},
    "player4": {"role": "忠臣", "personality": "忠诚且勇敢", "info": "无"},
    "player1": {"role": "派西维尔", "personality": "机智且善于观察, 注意保护梅林", "info": "知道player5和player6是梅林和莫甘娜, 但是不知道谁是谁", "role_notes": "识别真假梅林，保护真正的梅林"},
    "player6": {"role": "莫甘娜", "personality": "狡诈且富有魅力", "info": "知道player2是坏人", "role_notes": "伪装成梅林，误导派西维尔"},
    "player7": {"role": "忠臣", "personality": "忠诚且勇敢", "info": "无"}
}



class AwalonAssistantAgent(AssistantAgent):

    @staticmethod
    async def _add_messages_to_context(
        model_context,
        messages,
    ) -> None:
        """
        Add incoming messages to the model context.
        """
        for msg in messages:
            if isinstance(msg, HandoffMessage):
                for llm_msg in msg.context:
                    await model_context.add_message(llm_msg)
            await model_context.add_message(msg.to_model_message())

# 过滤掉投票信息的模型上下文
class FilterVoteInfoContext(UnboundedChatCompletionContext):
    "A model context for filtering out vote information from AssistantMessage."

    async def get_messages(self) -> List[LLMMessage]:
        messages = await super().get_messages()
        # Filter out thought field from AssistantMessage.
        messages_out: List[LLMMessage] = []
        for message_item in messages:
            message = message_item.model_copy()
            if isinstance(message, UserMessage):
                # 替换角色名为***
                roles_to_hide = ["梅林", "派西维尔", "忠臣", "刺客", "莫甘娜", "奥伯伦"]
                for role in roles_to_hide:
                    if message.content and isinstance(message.content, str):
                        message.content = message.content.replace(role, "***")
                    # if message.thought and isinstance(message.thought, str):
                    #     message.thought = message.thought.replace(role, "***")
            if isinstance(message, UserMessage) and message.source != "Host":
                # if message.thought and "我的投票是" in message.thought:
                #     message.thought = "[内容已隐藏]"
                if message.content and "我的投票是" in message.content:
                    message.content = "[内容已隐藏]"
            # print("Filtered message:", message)
            messages_out.append(message)
        return messages_out
    

model_client = AzureOpenAIChatCompletionClient(
    api_key=azure_api_key,
    azure_endpoint=azure_endpoint,
    model="gpt-4.1",
    azure_deployment=azure_deployment,
    api_version=api_version,
    parallel_tool_calls=False,
)
agent = AssistantAgent(name="assistant", model_client=model_client)

# result = await agent.run(task="阿瓦隆游戏的规则是什么？")
# print(result.messages[-1].content)

async def main():
    player_agents = []
    for player in players_info:
        prompt = player_prompts.format(
            role=players_info[player]["role"],
            all_players=players,
            player_name=player,
            personality=players_info[player]["personality"],
            info=players_info[player]["info"],
            role_notes=players_info[player].get("role_notes", "无")
        )
        # print(f'Creating agent for {player} with role {players_info[player]["role"]}, prompt:\n{prompt}\n')
        if player == 'player5':
            agent = UserProxyAgent(name = 'player5')
            print(f'Created UserProxyAgent for {player} with role {players_info[player]["role"]}\n')
        else:
            player_context = FilterVoteInfoContext()
            agent = AwalonAssistantAgent(
                name=player,
                handoffs=["Host"],
                model_client=model_client,
                model_context=player_context,
                system_message=prompt
            )
        player_agents.append(agent)
    host_agent = AwalonAssistantAgent(
        name="Host",
        handoffs=players,
        model_client=model_client,
        system_message=host_prompt.format(game_info=roles)
    )
    max_msg_termination = MaxMessageTermination(20)
    text_mention_termination = TextMentionTermination("terminate")
    team = Swarm([host_agent] + player_agents, termination_condition=text_mention_termination,)

    try: 
        f = open('avalon_game_log.txt', 'w', encoding='utf-8')
        f.write('=== 阿瓦隆游戏日志 ===\n')
        stream = team.run_stream(task="游戏开始")
        async for message in stream:
            try:
                f.write(f'role: {message.source}, content: {message.content}\n')
                f.flush()
                if 'ransfer' in message.content or (type(message.content) is not str):
                    continue
                print(f'role: {message.source}, content: {message.content}\n')
            except Exception as e:
                print(f'Error printing message from {message}: {e}')
    except Exception as e:
        print(f'Error during team interaction: {e}')

    for agent in player_agents + [host_agent]:
        print(f'=== Conversation model context for {agent.name} ===')
        # 尝试获取 agent 内部状态
        if hasattr(agent, '_model_context'):
            print(await agent._model_context.get_messages())
        print('=========================================')


if __name__ == "__main__":
    asyncio.run(main())