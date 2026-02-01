/**
 * Game status panel - displays real-time game state from Host.
 */

export interface HostGameState {
  phase: 'team_select' | 'speaking' | 'voting' | 'mission' | 'assassinate' | 'game_over';
  mission_round: number;
  captain: string | null;
  team_members: string[] | null;
  mission_success_count: number;
  mission_fail_count: number;
  reject_count: number;
  next_player: string | null;
}

interface GameStatusPanelProps {
  hostState: HostGameState | null;
  currentPlayerName?: string;
}

const PHASE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  team_select: { label: '队长组队', emoji: '👑', color: 'text-yellow-400' },
  speaking: { label: '发言阶段', emoji: '💬', color: 'text-blue-400' },
  voting: { label: '投票阶段', emoji: '🗳️', color: 'text-purple-400' },
  mission: { label: '执行任务', emoji: '⚔️', color: 'text-orange-400' },
  assassinate: { label: '刺杀阶段', emoji: '🗡️', color: 'text-red-400' },
  game_over: { label: '游戏结束', emoji: '🏆', color: 'text-green-400' },
};

export default function GameStatusPanel({ hostState, currentPlayerName }: GameStatusPanelProps) {
  if (!hostState) {
    return null;
  }

  const phaseConfig = PHASE_CONFIG[hostState.phase] || { label: '未知', emoji: '❓', color: 'text-gray-400' };

  return (
    <div className="glass rounded-xl p-4 fade-in">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <span>📊</span> 游戏状态
      </h3>

      {/* Current Phase */}
      <div className="mb-4">
        <div className={`text-2xl font-bold ${phaseConfig.color} flex items-center gap-2`}>
          <span>{phaseConfig.emoji}</span>
          <span>{phaseConfig.label}</span>
        </div>
      </div>

      {/* Mission Progress */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">当前轮次</div>
          <div className="text-xl font-bold text-white">
            第 <span className="text-yellow-400">{hostState.mission_round}</span> 轮
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">否决次数</div>
          <div className="text-xl font-bold text-white">
            <span className={hostState.reject_count >= 4 ? 'text-red-400' : 'text-orange-400'}>
              {hostState.reject_count}
            </span>
            <span className="text-sm text-slate-500"> / 5</span>
          </div>
        </div>
      </div>

      {/* Mission Score */}
      <div className="flex items-center justify-center gap-4 mb-4 py-2 bg-slate-800/30 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">{hostState.mission_success_count}</div>
          <div className="text-xs text-slate-400">好人胜</div>
        </div>
        <div className="text-slate-600 text-2xl">:</div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">{hostState.mission_fail_count}</div>
          <div className="text-xs text-slate-400">坏人胜</div>
        </div>
      </div>

      {/* Captain */}
      {hostState.captain && (
        <div className="mb-3">
          <div className="text-xs text-slate-400 mb-1">当前队长</div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400">👑</span>
            <span className={`font-medium ${hostState.captain === currentPlayerName ? 'text-blue-400' : 'text-white'}`}>
              {hostState.captain}
              {hostState.captain === currentPlayerName && <span className="text-xs ml-1">(你)</span>}
            </span>
          </div>
        </div>
      )}

      {/* Team Members */}
      {hostState.team_members && hostState.team_members.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-slate-400 mb-1">出征队员</div>
          <div className="flex flex-wrap gap-2">
            {hostState.team_members.map((member, idx) => (
              <span
                key={idx}
                className={`px-2 py-1 rounded-lg text-sm
                  ${member === currentPlayerName 
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                    : 'bg-slate-700/50 text-white'}`}
              >
                {member}
                {member === currentPlayerName && <span className="text-xs ml-1">(你)</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Next Player */}
      {hostState.next_player && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">等待:</span>
            <span className={`font-medium ${hostState.next_player === currentPlayerName ? 'text-blue-400 animate-pulse' : 'text-emerald-400'}`}>
              {hostState.next_player}
              {hostState.next_player === currentPlayerName && (
                <span className="ml-2 px-2 py-0.5 bg-blue-500/20 rounded text-xs">轮到你了!</span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
