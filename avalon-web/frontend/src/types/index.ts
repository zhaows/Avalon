/**
 * Type definitions for Avalon game.
 */

export type PlayerType = 'human' | 'ai';

export type GamePhase = 
  | 'waiting'
  | 'role_assign'
  | 'team_select'
  | 'speaking'
  | 'voting'
  | 'mission'
  | 'assassinate'
  | 'game_over';

export type Team = 'good' | 'evil';

export type Role = '梅林' | '派西维尔' | '忠臣' | '刺客' | '莫甘娜' | '奥伯伦';

export interface Player {
  id: string;
  name: string;
  seat: number;
  player_type: PlayerType;
  is_captain: boolean;
  is_on_mission: boolean;
  is_online: boolean;
  personality?: string;  // AI玩家人设
}

export interface Room {
  id: string;
  name: string;
  host_id: string;
  phase: GamePhase;
  players: Player[];
}

export interface RoomListItem {
  id: string;
  name: string;
  player_count: number;
  max_players: number;
  phase: GamePhase;
}

export interface GameState {
  phase: GamePhase;
  current_mission: number;
  mission_results: boolean[];
  captain_seat: number;
  current_team: string[];
  vote_reject_count: number;
  players: Player[];
  my_role?: Role;
  my_team?: Team;
  role_knowledge?: string;
  have_voted?: boolean;
  have_mission_voted?: boolean;
}

export interface GameMessage {
  type: string;
  player_id?: string;
  player_name?: string;
  content: any;
  timestamp: string;
}

export interface VoteResult {
  votes: Record<string, string>;
  approves: number;
  rejects: number;
  passed: boolean;
}

export interface MissionResult {
  mission: number;
  successes: number;
  fails: number;
  passed: boolean;
}

export interface GameOverData {
  winner: Team;
  roles: Record<string, Role>;
  mission_results: boolean[];
}
