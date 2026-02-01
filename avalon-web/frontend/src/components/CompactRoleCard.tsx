/**
 * Compact role card - shows player's role in a single row.
 */
import { Role, Team } from '../types';

interface CompactRoleCardProps {
  role?: Role;
  team?: Team;
  knowledge?: string;
}

const ROLE_INFO: Record<Role, { emoji: string }> = {
  '梅林': { emoji: '🧙' },
  '派西维尔': { emoji: '🛡️' },
  '忠臣': { emoji: '⚔️' },
  '刺客': { emoji: '🗡️' },
  '莫甘娜': { emoji: '🦹' },
  '奥伯伦': { emoji: '👻' },
};

export default function CompactRoleCard({ role, team, knowledge }: CompactRoleCardProps) {
  if (!role) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg">
        <span className="text-xl animate-pulse">🎭</span>
        <span className="text-slate-400 text-sm">等待分配...</span>
      </div>
    );
  }

  const roleInfo = ROLE_INFO[role];
  const isGood = team === 'good';

  return (
    <div className={`
      flex items-center gap-3 px-3 py-2 rounded-lg border
      ${isGood 
        ? 'bg-blue-500/10 border-blue-500/40' 
        : 'bg-red-500/10 border-red-500/40'}
    `}>
      <div className={`
        w-9 h-9 rounded-lg flex items-center justify-center text-xl flex-shrink-0
        ${isGood ? 'bg-blue-500/20' : 'bg-red-500/20'}
      `}>
        {roleInfo.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{role}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isGood ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
            {isGood ? '好人' : '坏人'}
          </span>
        </div>
        {knowledge && knowledge !== '无' && (
          <div className="text-xs text-amber-300 truncate" title={knowledge}>
            💡 {knowledge}
          </div>
        )}
      </div>
    </div>
  );
}
