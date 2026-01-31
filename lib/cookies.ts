// Cookie 管理ユーティリティ

export interface PlayerInfo {
    id: string;
    name: string;
    characterId: number | null;
}

export interface GameState {
    roomId: string;
    players: PlayerInfo[];
    phase: GamePhase;
    currentTurn: number;
    investigationCount: number;
    items: Record<number, number[]>; // characterId -> itemIds
    votes: VoteResult[];
    timerStart: number | null;
}

export type GamePhase =
    | 'waiting'
    | 'prologue'
    | 'discussion1'
    | 'investigation1'
    | 'discussion2'
    | 'additional_handout'
    | 'discussion3'
    | 'investigation2'
    | 'discussion4'
    | 'voting'
    | 'result';

export interface VoteResult {
    voterId: number;
    who: number;
    where: number;
    what: number;
    toWhom: number;
}

// Storage 操作 (本来は Cookie でしたが、テスト容易性のため SessionStorage に変更)
export function setCookie(name: string, value: string, days: number = 1): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(name, value);
    } catch (e) {
        console.error('SessionStorage access failed', e);
    }
}

export function getCookie(name: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage.getItem(name);
    } catch (e) {
        return null;
    }
}

export function deleteCookie(name: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(name);
    } catch (e) {
        console.error('SessionStorage access failed', e);
    }
}

// プレイヤー情報
export function getPlayerInfo(): PlayerInfo | null {
    const data = getCookie('player_info');
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

export function setPlayerInfo(info: PlayerInfo): void {
    setCookie('player_info', JSON.stringify(info));
}

// ゲーム状態
export function getGameState(): GameState | null {
    const data = getCookie('game_state');
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

export function setGameState(state: GameState): void {
    setCookie('game_state', JSON.stringify(state));
}

// 初期ゲーム状態を作成
export function createInitialGameState(roomId: string): GameState {
    return {
        roomId,
        players: [],
        phase: 'waiting',
        currentTurn: 0,
        investigationCount: 0,
        items: {},
        votes: [],
        timerStart: null,
    };
}

// ランダムID生成
export function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

// ルームID生成
export function generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
