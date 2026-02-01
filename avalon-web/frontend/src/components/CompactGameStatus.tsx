/**
 * Compact game status - displays game state in a horizontal bar.
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

interface CompactGameStatusProps {
  hostState: HostGameState | null;
  currentPlayerName?: string;
}

const PHASE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  team_select: { label: '组队', emoji: '👑', color: 'bg-yellow-500/20 text-yellow-400' },
  speaking: { label: '发言', emoji: '💬', color: 'bg-blue-500/20 text-blue-400' },
  voting: { label: '投票', emoji: '🗳️', color: 'bg-purple-500/20 text-purple-400' },
  mission: { label: '任务', emoji: '⚔️', color: 'bg-orange-500/20 text-orange-400' },
  assassinate: { label: '刺杀', emoji: '🗡️', color: 'bg-red-500/20 text-red-400' },
  game_over: { label: '结束', emoji: '🏆', color: 'bg-green-500/20 text-green-400' },
};

export default function CompactGameStatus({ hostState, currentPlayerName }: CompactGameStatusProps) {
  if (!hostState) {
    return (
      <div className="flex items-center gap-3 text-slate-400 text-sm">
        <span className="animate-pulse">⏳</span>
        <span>等待游戏开始...</span>
      </div>
    );
  }

  const phaseConfig = PHASE_CONFIG[hostState.phase] || { label: '未知', emoji: '❓', color: 'bg-gray-500/20 text-gray-400' };
  const isMyTurn = hostState.next_player === currentPlayerName;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Phase */}
      <span className={`px-2 py-1 rounded-lg text-sm font-medium flex items-center gap-1 ${phaseConfig.color}`}>
        <span>{phaseConfig.emoji}</span>
        <span>{phaseConfig.label}</span>
      </span>

      {/* Round */}
      <span className="px-2 py-1 rounded-lg text-sm bg-slate-700/50 text-slate-300">
        第<span className="text-yellow-400 font-bold mx-0.5">{hostState.mission_round}</span>轮
      </span>

      {/* Score */}
      <span className="px-2 py-1 rounded-lg text-sm bg-slate-700/50 flex items-center gap-1">
        <span className="text-blue-400 font-bold">{hostState.mission_success_count}</span>
        <span className="text-slate-500">:</span>
        <span className="text-red-400 font-bold">{hostState.mission_fail_count}</span>
      </span>

      {/* Reject count - only show if > 0 */}
      {hostState.reject_count > 0 && (
        <span className={`px-2 py-1 rounded-lg text-sm ${hostState.reject_count >= 4 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
          否决{hostState.reject_count}/5
        </span>
      )}

      {/* Captain */}
      {hostState.captain && (
        <span className="px-2 py-1 rounded-lg text-sm bg-yellow-500/10 text-yellow-400 flex items-center gap-1">
          <span>👑</span>
          <span className={hostState.captain === currentPlayerName ? 'underline' : ''}>
            {hostState.captain}
          </span>
        </span>
      )}

      {/* Team members */}
      {hostState.team_members && hostState.team_members.length > 0 && (
        <span className="px-2 py-1 rounded-lg text-sm bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
          <span>🎯</span>
          <span>{hostState.team_members.join(', ')}</span>
        </span>
      )}

      {/* Next player indicator */}
      {isMyTurn && (
        <span className="px-2 py-1 rounded-lg text-sm bg-blue-500/20 text-blue-400 animate-pulse font-medium">
          ⭐ 轮到你了
        </span>
      )}
    </div>
  );
}
