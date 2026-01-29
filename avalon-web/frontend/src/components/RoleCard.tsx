/**
 * Role card component - shows player's role information.
 */
import { Role, Team } from '../types';

interface RoleCardProps {
  role?: Role;
  team?: Team;
  knowledge?: string;
}

const ROLE_INFO: Record<Role, { emoji: string; description: string }> = {
  '梅林': { emoji: '🧙', description: '知晓坏人身份，需隐藏自己' },
  '派西维尔': { emoji: '🛡️', description: '能看到梅林与莫甘娜' },
  '忠臣': { emoji: '⚔️', description: '忠诚的圆桌骑士' },
  '刺客': { emoji: '🗡️', description: '终局可刺杀梅林' },
  '莫甘娜': { emoji: '🦹', description: '伪装成梅林' },
  '奥伯伦': { emoji: '👻', description: '孤立的坏人' },
};

export default function RoleCard({ role, team, knowledge }: RoleCardProps) {
  if (!role) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="text-center text-slate-400 py-4">
          <div className="text-3xl mb-2 animate-float">🎭</div>
          等待角色分配...
        </div>
      </div>
    );
  }

  const roleInfo = ROLE_INFO[role];
  const isGood = team === 'good';

  return (
    <div className={`
      rounded-2xl p-5 border-2 fade-in
      ${isGood 
        ? 'bg-blue-500/10 border-blue-500/50' 
        : 'bg-red-500/10 border-red-500/50'}
    `}>
      {/* Role header */}
      <div className="flex items-center gap-4 mb-4">
        <div className={`
          w-14 h-14 rounded-xl flex items-center justify-center text-3xl
          ${isGood ? 'bg-blue-500/20' : 'bg-red-500/20'}
        `}>
          {roleInfo.emoji}
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white">{role}</h3>
          <p className={`text-sm font-medium ${isGood ? 'text-blue-400' : 'text-red-400'}`}>
            {isGood ? '🔵 好人阵营' : '🔴 坏人阵营'}
          </p>
        </div>
      </div>

      {/* Role description */}
      <p className="text-slate-300 text-sm mb-4 leading-relaxed">
        {roleInfo.description}
      </p>

      {/* Role knowledge */}
      {knowledge && knowledge !== '无' && (
        <div className={`rounded-xl p-4 ${isGood ? 'bg-blue-950/50' : 'bg-red-950/50'}`}>
          <div className="text-xs text-slate-400 mb-2 font-medium">🔍 你的情报</div>
          <div className="text-sm text-amber-300 leading-relaxed">{knowledge}</div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <div className="text-xs text-slate-500">
          {isGood ? (
            <>💡 目标：完成3次任务，保护梅林</>
          ) : (
            <>💡 目标：搞砸3次任务，或刺杀梅林</>
          )}
        </div>
      </div>
    </div>
  );
}
