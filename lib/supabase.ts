// Supabase クライアント設定
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// Supabase が設定されているかチェック
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.includes('supabase.co'));

if (typeof window !== 'undefined') {
    console.log('[Supabase Config]', {
        url: supabaseUrl ? 'OK' : 'MISSING',
        key: supabaseAnonKey ? 'OK' : 'MISSING',
        isConfigured: isSupabaseConfigured
    });
}

// Supabase クライアント生成（エラーハンドリング付き）
const createSupabaseClient = () => {
    if (isSupabaseConfigured) {
        try {
            return createClient(supabaseUrl, supabaseAnonKey);
        } catch (e) {
            console.error('Failed to initialize Supabase client:', e);
        }
    }
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
};

export const supabase: SupabaseClient = createSupabaseClient();

// デモモード用のローカルストレージ
function getLocalStorage<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function setLocalStorage<T>(key: string, data: T[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
}

// 型定義
export interface Room {
    id: string;
    created_at: string;
    phase: string;
    timer_start: string | null;
    host_id: string;
}

export interface Player {
    id: string;
    room_id: string;
    name: string;
    character_id: number | null;
    items: number[];
    created_at: string;
}

export interface ChatMessage {
    id: string;
    room_id: string;
    player_id: string;
    player_name: string;
    character_name: string;
    content: string;
    created_at: string;
}

export interface Vote {
    id: string;
    room_id: string;
    player_id: string;
    who: number;
    where_location: number;
    what_item: number;
    to_whom: number;
    created_at: string;
}

// ルーム作成
export async function createRoom(hostId: string): Promise<Room | null> {
    const roomId = generateRoomId();
    const newRoom: Room = {
        id: roomId,
        created_at: new Date().toISOString(),
        phase: 'waiting',
        timer_start: null,
        host_id: hostId,
    };

    if (!isSupabaseConfigured) {
        // デモモード
        const rooms = getLocalStorage<Room>('demo_rooms');
        rooms.push(newRoom);
        setLocalStorage('demo_rooms', rooms);
        return newRoom;
    }

    const { data, error } = await supabase
        .from('rooms')
        .insert({
            id: roomId,
            phase: 'waiting',
            host_id: hostId,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating room:', error);
        return null;
    }
    return data;
}

// ルーム取得
export async function getRoom(roomId: string): Promise<Room | null> {
    if (!isSupabaseConfigured) {
        const rooms = getLocalStorage<Room>('demo_rooms');
        return rooms.find(r => r.id === roomId) || null;
    }

    const { data, error } = await supabase
        .from('rooms')
        .select()
        .eq('id', roomId)
        .single();

    if (error) {
        // PGRST116 は「該当データなし」のエラー（ID間違いなど）
        if (error.code !== 'PGRST116') {
            console.error('Error getting room:', JSON.stringify(error, null, 2));
        }
        return null;
    }
    return data;
}

// ルーム更新
export async function updateRoom(roomId: string, updates: Partial<Room>): Promise<boolean> {
    if (!isSupabaseConfigured) {
        const rooms = getLocalStorage<Room>('demo_rooms');
        const index = rooms.findIndex(r => r.id === roomId);
        if (index >= 0) {
            rooms[index] = { ...rooms[index], ...updates };
            setLocalStorage('demo_rooms', rooms);
        }
        return true;
    }

    const { error } = await supabase
        .from('rooms')
        .update(updates)
        .eq('id', roomId);

    if (error) {
        console.error('Error updating room:', error);
        return false;
    }
    return true;
}

// プレイヤー参加
export async function joinRoom(roomId: string, playerId: string, name: string, characterId: number | null): Promise<Player | null> {
    const newPlayer: Player = {
        id: playerId,
        room_id: roomId,
        name,
        character_id: characterId,
        items: [],
        created_at: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
        const players = getLocalStorage<Player>('demo_players');
        players.push(newPlayer);
        setLocalStorage('demo_players', players);
        return newPlayer;
    }

    const { data, error } = await supabase
        .from('players')
        .upsert({
            id: playerId,
            room_id: roomId,
            name,
            character_id: characterId,
            items: [],
        }, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        console.error('Error joining room:', error);
        return null;
    }
    return data;
}

// プレイヤー一覧取得
export async function getPlayers(roomId: string): Promise<Player[]> {
    if (!isSupabaseConfigured) {
        const players = getLocalStorage<Player>('demo_players');
        return players.filter(p => p.room_id === roomId);
    }

    const { data, error } = await supabase
        .from('players')
        .select()
        .eq('room_id', roomId)
        .order('created_at');

    if (error) {
        console.error('Error getting players:', error);
        return [];
    }
    return data || [];
}

// プレイヤー更新
export async function updatePlayer(playerId: string, updates: Partial<Player>): Promise<boolean> {
    if (!isSupabaseConfigured) {
        const players = getLocalStorage<Player>('demo_players');
        const index = players.findIndex(p => p.id === playerId);
        if (index >= 0) {
            players[index] = { ...players[index], ...updates };
            setLocalStorage('demo_players', players);
        }
        return true;
    }

    const { error } = await supabase
        .from('players')
        .update(updates)
        .eq('id', playerId);

    if (error) {
        console.error('Error updating player:', error);
        return false;
    }
    return true;
}

// チャットメッセージ送信
export async function sendChatMessage(roomId: string, playerId: string, playerName: string, characterName: string, content: string): Promise<boolean> {
    const newMessage: ChatMessage = {
        id: generatePlayerId(),
        room_id: roomId,
        player_id: playerId,
        player_name: playerName,
        character_name: characterName,
        content,
        created_at: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
        const messages = getLocalStorage<ChatMessage>('demo_messages');
        messages.push(newMessage);
        setLocalStorage('demo_messages', messages);
        return true;
    }

    const { error } = await supabase
        .from('chat_messages')
        .insert({
            room_id: roomId,
            player_id: playerId,
            player_name: playerName,
            character_name: characterName,
            content,
        });

    if (error) {
        console.error('Error sending chat message:', error);
        return false;
    }
    return true;
}

// チャットメッセージ取得
export async function getChatMessages(roomId: string): Promise<ChatMessage[]> {
    if (!isSupabaseConfigured) {
        const messages = getLocalStorage<ChatMessage>('demo_messages');
        return messages.filter(m => m.room_id === roomId);
    }

    const { data, error } = await supabase
        .from('chat_messages')
        .select()
        .eq('room_id', roomId)
        .order('created_at');

    if (error) {
        console.error('Error getting chat messages:', error);
        return [];
    }
    return data || [];
}

// 投票送信
export async function submitVote(roomId: string, playerId: string, vote: { who: number; where: number; what: number; toWhom: number }): Promise<boolean> {
    const newVote: Vote = {
        id: generatePlayerId(),
        room_id: roomId,
        player_id: playerId,
        who: vote.who,
        where_location: vote.where,
        what_item: vote.what,
        to_whom: vote.toWhom,
        created_at: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
        const votes = getLocalStorage<Vote>('demo_votes');
        votes.push(newVote);
        setLocalStorage('demo_votes', votes);
        return true;
    }

    const { error } = await supabase
        .from('votes')
        .insert({
            room_id: roomId,
            player_id: playerId,
            who: vote.who,
            where_location: vote.where,
            what_item: vote.what,
            to_whom: vote.toWhom,
        });

    if (error) {
        console.error('Error submitting vote:', error);
        return false;
    }
    return true;
}

// 投票削除（リトライ用）
export async function deleteVote(roomId: string, playerId: string): Promise<boolean> {
    if (!isSupabaseConfigured) {
        const votes = getLocalStorage<Vote>('demo_votes');
        const newVotes = votes.filter(v => !(v.room_id === roomId && v.player_id === playerId));
        setLocalStorage('demo_votes', newVotes);
        return true;
    }

    const { error } = await supabase
        .from('votes')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', playerId);

    if (error) {
        console.error('Error deleting vote:', error);
        return false;
    }
    return true;
}

// 投票取得
export async function getVotes(roomId: string): Promise<Vote[]> {
    if (!isSupabaseConfigured) {
        const votes = getLocalStorage<Vote>('demo_votes');
        return votes.filter(v => v.room_id === roomId);
    }

    const { data, error } = await supabase
        .from('votes')
        .select()
        .eq('room_id', roomId);

    if (error) {
        console.error('Error getting votes:', error);
        return [];
    }
    return data || [];
}

// リアルタイム購読: ルーム（デモモードでは空のサブスクリプション）
export function subscribeToRoom(roomId: string, callback: (room: Room) => void) {
    if (!isSupabaseConfigured) {
        // デモモードではポーリングで代用
        const interval = setInterval(async () => {
            const room = await getRoom(roomId);
            if (room) callback(room);
        }, 2000);
        return { unsubscribe: () => clearInterval(interval) };
    }

    return supabase
        .channel(`room:${roomId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
            (payload) => {
                if (payload.new) {
                    callback(payload.new as Room);
                }
            }
        )
        .subscribe();
}

// リアルタイム購読: プレイヤー
export function subscribeToPlayers(roomId: string, callback: (players: Player[]) => void) {
    if (!isSupabaseConfigured) {
        const interval = setInterval(async () => {
            const players = await getPlayers(roomId);
            callback(players);
        }, 2000);
        return { unsubscribe: () => clearInterval(interval) };
    }

    return supabase
        .channel(`players:${roomId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
            async () => {
                const players = await getPlayers(roomId);
                callback(players);
            }
        )
        .subscribe();
}

// リアルタイム購読: チャット
export function subscribeToChat(roomId: string, callback: (message: ChatMessage) => void) {
    if (!isSupabaseConfigured) {
        let lastCount = 0;
        const interval = setInterval(async () => {
            const messages = await getChatMessages(roomId);
            if (messages.length > lastCount) {
                callback(messages[messages.length - 1]);
                lastCount = messages.length;
            }
        }, 1000);
        return { unsubscribe: () => clearInterval(interval) };
    }

    return supabase
        .channel(`chat:${roomId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
            (payload) => {
                if (payload.new) {
                    callback(payload.new as ChatMessage);
                }
            }
        )
        .subscribe();
}

// リアルタイム購読: 投票
export function subscribeToVotes(roomId: string, callback: (votes: Vote[]) => void) {
    if (!isSupabaseConfigured) {
        const interval = setInterval(async () => {
            const votes = await getVotes(roomId);
            callback(votes);
        }, 2000);
        return { unsubscribe: () => clearInterval(interval) };
    }

    return supabase
        .channel(`votes:${roomId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` },
            async () => {
                const votes = await getVotes(roomId);
                callback(votes);
            }
        )
        .subscribe();
}

// ルームID生成
function generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// プレイヤーID生成
export function generatePlayerId(): string {
    return Math.random().toString(36).substring(2, 12);
}
