/**
 * Chat panel component - shows game messages.
 */
import { useEffect, useRef } from 'react';
import { GameMessage } from '../types';

interface ChatPanelProps {
  messages: GameMessage[];
}

export default function ChatPanel({ messages }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessage = (msg: GameMessage, index: number) => {
    switch (msg.type) {
      case 'speak':
        return (
          <div key={index} className="mb-2 fade-in">
            <span className="text-blue-400 font-medium">{msg.player_name}:</span>
            <span className="text-gray-200 ml-2">{msg.content}</span>
          </div>
        );

      case 'phase_change':
        return (
          <div key={index} className="mb-2 text-center fade-in">
            <span className="px-3 py-1 bg-purple-600/50 rounded-full text-sm text-purple-200">
              📢 {msg.content.message || `进入${msg.content.phase}阶段`}
            </span>
          </div>
        );

      case 'vote_result':
        const voteContent = msg.content;
        return (
          <div key={index} className="mb-2 bg-gray-700/50 rounded-lg p-2 fade-in">
            <div className="text-center text-sm">
              投票结果: {voteContent.passed ? (
                <span className="text-green-400">通过 ✓</span>
              ) : (
                <span className="text-red-400">否决 ✗</span>
              )}
            </div>
            <div className="text-xs text-gray-400 text-center">
              同意 {voteContent.approves} / 反对 {voteContent.rejects}
            </div>
          </div>
        );

      case 'mission_result':
        const missionContent = msg.content;
        return (
          <div key={index} className="mb-2 bg-gray-700/50 rounded-lg p-2 fade-in">
            <div className="text-center text-sm">
              任务{missionContent.mission}结果: {missionContent.passed ? (
                <span className="text-blue-400">成功 ✓</span>
              ) : (
                <span className="text-red-400">失败 ✗</span>
              )}
            </div>
            <div className="text-xs text-gray-400 text-center">
              成功票 {missionContent.successes} / 失败票 {missionContent.fails}
            </div>
          </div>
        );

      case 'game_over':
        const gameOverContent = msg.content;
        return (
          <div key={index} className="mb-2 bg-gradient-to-r from-yellow-900/50 to-orange-900/50 
                                       rounded-lg p-3 fade-in border border-yellow-500">
            <div className="text-center">
              <div className="text-xl font-bold mb-2">
                🏆 游戏结束 🏆
              </div>
              <div className={`text-lg ${gameOverContent.winner === 'good' ? 'text-blue-400' : 'text-red-400'}`}>
                {gameOverContent.winner === 'good' ? '🔵 好人阵营胜利！' : '🔴 坏人阵营胜利！'}
              </div>
              <div className="mt-2 text-sm text-gray-300">
                角色揭晓:
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {Object.entries(gameOverContent.roles).map(([name, role]) => (
                    <span key={name} className="px-2 py-1 bg-gray-800 rounded text-xs">
                      {name}: {role as string}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div key={index} className="mb-2 text-gray-400 text-sm fade-in">
            [{msg.type}] {JSON.stringify(msg.content)}
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 backdrop-blur-sm flex-1 flex flex-col min-h-[200px]">
      <h3 className="text-lg font-bold text-white mb-2">💬 游戏消息</h3>
      
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-2 text-sm"
        style={{ maxHeight: '300px' }}
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            暂无消息
          </div>
        ) : (
          messages.map((msg, index) => renderMessage(msg, index))
        )}
      </div>
    </div>
  );
}
