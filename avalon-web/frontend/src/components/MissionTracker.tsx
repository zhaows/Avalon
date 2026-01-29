/**
 * Mission tracker component - shows mission progress.
 */

interface MissionTrackerProps {
  currentMission: number;
  missionResults: boolean[];
}

// Mission configuration
const MISSION_CONFIG = [
  { size: 2, fails: 1 },
  { size: 3, fails: 1 },
  { size: 3, fails: 1 },
  { size: 4, fails: 2 },
  { size: 4, fails: 1 },
];

export default function MissionTracker({ currentMission, missionResults }: MissionTrackerProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-4">
        {MISSION_CONFIG.map((config, index) => {
          const missionNum = index + 1;
          const result = missionResults[index];
          const isCurrent = missionNum === currentMission && result === undefined;
          const isPast = missionNum < currentMission || result !== undefined;
          
          return (
            <div key={missionNum} className="flex flex-col items-center">
              {/* Mission circle */}
              <div
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold
                  border-4 transition-all duration-300
                  ${result === true ? 'bg-blue-600 border-blue-400 text-white' : ''}
                  ${result === false ? 'bg-red-600 border-red-400 text-white' : ''}
                  ${isCurrent ? 'bg-yellow-600 border-yellow-400 text-white pulse-glow' : ''}
                  ${!isPast && !isCurrent ? 'bg-gray-700 border-gray-600 text-gray-400' : ''}
                `}
              >
                {result === true && '✓'}
                {result === false && '✗'}
                {result === undefined && missionNum}
              </div>
              
              {/* Mission info */}
              <div className="text-xs text-gray-400 mt-1 text-center">
                {config.size}人
                {config.fails > 1 && (
                  <span className="text-red-400 ml-1">({config.fails}票失败)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Score summary */}
      <div className="flex justify-center gap-8 mt-4 text-sm">
        <div className="text-blue-400">
          好人胜利: {missionResults.filter(r => r === true).length}
        </div>
        <div className="text-red-400">
          坏人胜利: {missionResults.filter(r => r === false).length}
        </div>
      </div>
    </div>
  );
}
