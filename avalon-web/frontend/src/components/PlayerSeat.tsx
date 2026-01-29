/**
 * Player seat component - displays a player in the game circle.
 */
import { Player } from '../types';

interface PlayerSeatProps {
  player: Player;
  isMe: boolean;
  isSelectable: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

export default function PlayerSeat({ 
  player, 
  isMe, 
  isSelectable, 
  isSelected,
  onSelect 
}: PlayerSeatProps) {
  const handleClick = () => {
    if (isSelectable) {
      onSelect();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        w-20 h-24 flex flex-col items-center justify-center rounded-xl
        transition-all duration-200 cursor-pointer
        ${isMe ? 'bg-blue-900/80 border-2 border-blue-400' : 'bg-gray-700/80 border-2 border-gray-600'}
        ${isSelected ? 'ring-4 ring-yellow-400 scale-110' : ''}
        ${isSelectable ? 'hover:scale-105 hover:border-yellow-400' : ''}
        ${player.is_captain ? 'ring-2 ring-yellow-500' : ''}
        ${player.is_on_mission ? 'bg-green-900/50' : ''}
        ${!player.is_online ? 'opacity-50' : ''}
      `}
    >
      {/* Avatar */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center text-xl mb-1
        ${player.player_type === 'ai' ? 'bg-purple-600' : 'bg-green-600'}
      `}>
        {player.player_type === 'ai' ? '🤖' : '👤'}
      </div>
      
      {/* Name */}
      <div className="text-xs text-white font-medium text-center truncate w-full px-1">
        {player.name}
        {isMe && <span className="text-blue-300"> (你)</span>}
      </div>
      
      {/* Status icons */}
      <div className="flex gap-1 mt-1">
        {player.is_captain && <span title="队长">👑</span>}
        {player.is_on_mission && <span title="任务中">⚔️</span>}
        {!player.is_online && <span title="离线">💤</span>}
      </div>
      
      {/* Seat number */}
      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gray-900 rounded-full 
                      flex items-center justify-center text-xs text-gray-400">
        {player.seat}
      </div>
    </div>
  );
}
