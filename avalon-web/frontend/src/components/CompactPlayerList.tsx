/**
 * Compact player list - displays players in a horizontal scrollable row.
 */
import { Player } from '../types';

interface CompactPlayerListProps {
  players: Player[];
  currentPlayerName?: string;
  captain?: string | null;
  teamMembers?: string[] | null;
  nextPlayer?: string | null;
}

export default function CompactPlayerList({ 
  players, 
  currentPlayerName, 
  captain, 
  teamMembers,
  nextPlayer 
}: CompactPlayerListProps) {
  if (!players || players.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
      {players.map((player) => {
        const isMe = player.name === currentPlayerName;
        const isCaptain = player.name === captain;
        const isTeamMember = teamMembers?.includes(player.name);
        const isNextPlayer = player.name === nextPlayer;
        const isAI = player.player_type === 'ai';

        return (
          <div
            key={player.id}
            className={`
              flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all
              ${isMe 
                ? 'bg-blue-500/20 border border-blue-500/40' 
                : isTeamMember 
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-slate-800/50 border border-transparent'}
              ${isNextPlayer ? 'ring-2 ring-yellow-400/50' : ''}
            `}
            title={`${player.name}${isMe ? ' (你)' : ''}${isCaptain ? ' 👑队长' : ''}${isTeamMember ? ' 🎯队员' : ''}`}
          >
            {/* Avatar */}
            <div className={`
              w-7 h-7 rounded-md flex items-center justify-center text-sm
              ${isAI ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}
            `}>
              {isAI ? '🤖' : '👤'}
            </div>
            
            {/* Name with indicators */}
            <div className="flex items-center gap-1">
              {isCaptain && <span className="text-yellow-400 text-xs">👑</span>}
              {isTeamMember && !isCaptain && <span className="text-emerald-400 text-xs">🎯</span>}
              <span className={`text-sm font-medium ${isMe ? 'text-blue-400' : 'text-white'}`}>
                {player.name}
              </span>
              {isMe && <span className="text-blue-400 text-xs">(你)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
