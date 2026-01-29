/**
 * Action panel component - handles player actions.
 */
import { useState } from 'react';
import { GamePhase, Player, Role, Team } from '../types';

interface ActionPanelProps {
  phase: GamePhase;
  isCaptain: boolean;
  isOnMission: boolean;
  myRole?: Role;
  myTeam?: Team;
  players: Player[];
  selectedTeam: string[];
  currentMission: number;
  haveVoted?: boolean;
  haveMissionVoted?: boolean;
  onConfirmTeam: () => void;
  onSpeak: (message: string) => void;
  onVote: (approve: boolean) => void;
  onMissionVote: (success: boolean) => void;
  onAssassinate: (targetId: string) => void;
}

const MISSION_CONFIG: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 };

export default function ActionPanel({
  phase,
  isCaptain,
  isOnMission,
  myRole,
  myTeam,
  players,
  selectedTeam,
  currentMission,
  haveVoted,
  haveMissionVoted,
  onConfirmTeam,
  onSpeak,
  onVote,
  onMissionVote,
  onAssassinate,
}: ActionPanelProps) {
  const [message, setMessage] = useState('');
  const [assassinTarget, setAssassinTarget] = useState<string | null>(null);

  const handleSendMessage = () => {
    if (message.trim()) {
      onSpeak(message.trim());
      setMessage('');
    }
  };

  const teamSize = MISSION_CONFIG[currentMission];
  const isEvil = myTeam === 'evil';

  // Render based on phase
  const renderContent = () => {
    switch (phase) {
      case 'team_select':
        if (isCaptain) {
          return (
            <div className="flex flex-col gap-3">
              <div className="text-white">
                👑 你是队长！请选择 {teamSize} 名队员执行任务。
                <span className="text-yellow-400 ml-2">
                  (已选择 {selectedTeam.length}/{teamSize})
                </span>
              </div>
              <button
                onClick={onConfirmTeam}
                disabled={selectedTeam.length !== teamSize}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 
                           disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
              >
                确认队伍
              </button>
            </div>
          );
        }
        return (
          <div className="text-gray-400 text-center">
            等待队长选择队伍...
          </div>
        );

      case 'speaking':
        return (
          <div className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="输入你的发言..."
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg 
                         text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={!message.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                         text-white rounded-lg transition-colors"
            >
              发言
            </button>
          </div>
        );

      case 'voting':
        if (haveVoted) {
          return (
            <div className="text-green-400 text-center">
              ✓ 你已投票，等待其他玩家...
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <div className="text-white text-center">
              🗳️ 请对当前队伍进行投票
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => onVote(true)}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold 
                           rounded-lg transition-colors"
              >
                ✓ 同意
              </button>
              <button
                onClick={() => onVote(false)}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold 
                           rounded-lg transition-colors"
              >
                ✗ 反对
              </button>
            </div>
          </div>
        );

      case 'mission':
        if (!isOnMission) {
          return (
            <div className="text-gray-400 text-center">
              等待任务队伍执行任务...
            </div>
          );
        }
        if (haveMissionVoted) {
          return (
            <div className="text-green-400 text-center">
              ✓ 你已选择，等待其他队员...
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <div className="text-white text-center">
              ⚔️ 你是任务队员！请选择你的行动
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => onMissionVote(true)}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold 
                           rounded-lg transition-colors"
              >
                ✓ 成功
              </button>
              {isEvil && (
                <button
                  onClick={() => onMissionVote(false)}
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold 
                             rounded-lg transition-colors"
                >
                  ✗ 失败
                </button>
              )}
            </div>
            {!isEvil && (
              <div className="text-sm text-gray-400 text-center">
                (好人只能选择成功)
              </div>
            )}
          </div>
        );

      case 'assassinate':
        if (myRole !== '刺客') {
          return (
            <div className="text-gray-400 text-center">
              等待刺客选择刺杀目标...
            </div>
          );
        }
        const goodPlayers = players.filter(p => {
          // In a real game, assassin doesn't know who's good
          // But we show all players for selection
          return true;
        });
        return (
          <div className="flex flex-col gap-3">
            <div className="text-white text-center">
              🗡️ 你是刺客！请选择你认为是梅林的玩家
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {goodPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setAssassinTarget(player.id)}
                  className={`px-4 py-2 rounded-lg transition-colors
                    ${assassinTarget === player.id 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-600 hover:bg-gray-500 text-white'}`}
                >
                  {player.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => assassinTarget && onAssassinate(assassinTarget)}
              disabled={!assassinTarget}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors mt-2"
            >
              确认刺杀
            </button>
          </div>
        );

      case 'game_over':
        return (
          <div className="text-center">
            <div className="text-xl text-white mb-2">游戏结束！</div>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold 
                         rounded-lg transition-colors"
            >
              返回首页
            </button>
          </div>
        );

      default:
        return (
          <div className="text-gray-400 text-center">
            等待中...
          </div>
        );
    }
  };

  return (
    <div className="mt-4 bg-gray-800/50 rounded-xl p-4 backdrop-blur-sm">
      {renderContent()}
    </div>
  );
}
