'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { characters, locations, getAllItems } from '@/lib/scenario';
import {
    getRoom,
    updateRoom,
    submitVote,
    getVotes,
    getPlayers,
    subscribeToRoom,
    subscribeToVotes,
    subscribeToPlayers,
    Vote,
    Player
} from '@/lib/supabase';
import { getPlayerInfo, getCookie } from '@/lib/cookies';

export default function VotePage() {
    const router = useRouter();
    const [playerInfo] = useState(getPlayerInfo());
    const [vote, setVote] = useState({
        who: 0,
        where: 0,
        what: 0,
        toWhom: 0,
    });
    const [submitted, setSubmitted] = useState(false);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [isHost, setIsHost] = useState(false);

    const roomId = getCookie('room_id');
    const allItems = getAllItems();

    useEffect(() => {
        if (!roomId || !playerInfo) {
            router.push('/');
            return;
        }

        const loadData = async () => {
            const [room, existingVotes, currentPlayers] = await Promise.all([
                getRoom(roomId),
                getVotes(roomId),
                getPlayers(roomId)
            ]);

            if (room) {
                setIsHost(room.host_id === playerInfo.id);

                // 既に投票済みかチェック
                const myVote = existingVotes.find(v => v.player_id === playerInfo.id);
                if (myVote) {
                    setSubmitted(true);
                }
            }
            setVotes(existingVotes);
            setPlayers(currentPlayers);
        };

        loadData();

        // リアルタイム購読
        const roomSub = subscribeToRoom(roomId, (updatedRoom) => {
            if (updatedRoom.phase === 'result') {
                router.push('/result');
            }
        });

        const votesSub = subscribeToVotes(roomId, setVotes);
        const playersSub = subscribeToPlayers(roomId, setPlayers);

        return () => {
            roomSub.unsubscribe();
            votesSub.unsubscribe();
            playersSub.unsubscribe();
        };
    }, [roomId, playerInfo, router]);

    // 全員投票完了時の自動遷移チェック
    useEffect(() => {
        console.log('Vote Check:', { isHost, votes: votes.length, players: players.length, roomId });

        if (isHost && roomId && players.length > 0 && votes.length >= players.length) {
            console.log('All voted! Proceeding to result...');
            // 全員投票完了
            const proceed = async () => {
                await updateRoom(roomId, { phase: 'result' });
            };
            proceed();
        }
    }, [votes, players, isHost, roomId]);

    const handleSubmit = async () => {
        if (!roomId || !playerInfo?.id) return;

        setLoading(true);

        const success = await submitVote(roomId, playerInfo.id, vote);
        if (success) {
            setSubmitted(true);
        }

        setLoading(false);
    };

    const handleProceedToResult = async () => {
        if (!roomId) return;

        setLoading(true);
        await updateRoom(roomId, { phase: 'result' });
        setLoading(false);
    };

    if (!playerInfo) {
        return <div className={styles.loading}>読み込み中...</div>;
    }

    return (
        <div className={styles.container}>
            {/* 背景 */}
            <div className={styles.backgroundOverlay}>
                <Image
                    src="/images/smoke-dark.png"
                    alt=""
                    fill
                    style={{ objectFit: 'cover', opacity: 0.4 }}
                />
            </div>
            <header className={styles.header}>
                <h1>投票フェーズ</h1>
                <p className={styles.instruction}>
                    {submitted
                        ? `投票完了！ (${votes.length}人が投票済み)`
                        : '犯人と犯行の詳細を推理して投票してください'}
                </p>
            </header>

            <main className={styles.main}>
                {!submitted ? (
                    <div className={styles.voteForm}>
                        {/* 誰が（犯人） */}
                        <div className={styles.voteSection}>
                            <h3>誰が（犯人は誰？）</h3>
                            <div className={styles.optionGrid}>
                                {characters.map(char => (
                                    <button
                                        key={char.id}
                                        className={`${styles.optionBtn} ${vote.who === char.id ? styles.selected : ''}`}
                                        onClick={() => setVote(prev => ({ ...prev, who: char.id }))}
                                        style={{ '--char-color': char.color } as React.CSSProperties}
                                    >
                                        {char.name}
                                    </button>
                                ))}
                                <button
                                    className={`${styles.optionBtn} ${vote.who === 99 ? styles.selected : ''}`}
                                    onClick={() => setVote(prev => ({ ...prev, who: 99 }))}
                                >
                                    その他
                                </button>
                            </div>
                        </div>

                        {/* どこで */}
                        <div className={styles.voteSection}>
                            <h3>どこで（犯行現場は？）</h3>
                            <div className={styles.optionGrid}>
                                {[
                                    { id: 1, name: '操縦室' },
                                    { id: 3, name: '倉庫' },
                                    { id: 4, name: 'エアロック' },
                                    { id: 5, name: 'トイレ' },
                                    { id: 6, name: '自室' },
                                    { id: 99, name: 'その他' }
                                ].map(loc => (
                                    <button
                                        key={loc.id}
                                        className={`${styles.optionBtn} ${vote.where === loc.id ? styles.selected : ''}`}
                                        onClick={() => setVote(prev => ({ ...prev, where: loc.id }))}
                                    >
                                        {loc.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 何を（凶器） */}
                        <div className={styles.voteSection}>
                            <h3>何を（凶器は？）</h3>
                            <div className={styles.optionGrid}>
                                {[
                                    { id: 3, name: 'スタンガン' },
                                    { id: 11, name: '麻酔銃' },
                                    { id: 7, name: 'うんこ' },
                                    { id: 9, name: 'トッポ' },
                                    { id: 99, name: 'その他' }
                                ].map(item => (
                                    <button
                                        key={item.id}
                                        className={`${styles.optionBtn} ${vote.what === item.id ? styles.selected : ''}`}
                                        onClick={() => setVote(prev => ({ ...prev, what: item.id }))}
                                    >
                                        {item.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 誰に */}
                        <div className={styles.voteSection}>
                            <h3>誰に（被害者は？）</h3>
                            <div className={styles.optionGrid}>
                                {characters.map(char => (
                                    <button
                                        key={char.id}
                                        className={`${styles.optionBtn} ${vote.toWhom === char.id ? styles.selected : ''}`}
                                        onClick={() => setVote(prev => ({ ...prev, toWhom: char.id }))}
                                        style={{ '--char-color': char.color } as React.CSSProperties}
                                    >
                                        {char.name}
                                    </button>
                                ))}
                                <button
                                    className={`${styles.optionBtn} ${vote.toWhom === 99 ? styles.selected : ''}`}
                                    onClick={() => setVote(prev => ({ ...prev, toWhom: 99 }))}
                                >
                                    その他
                                </button>
                            </div>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!vote.who || !vote.where || !vote.what || !vote.toWhom || loading}
                        >
                            {loading ? '送信中...' : '投票する'}
                        </button>
                    </div>
                ) : (
                    <div className={styles.submitted}>
                        <h2>投票完了！</h2>
                        <p>全員の投票が揃ったら結果発表に進みます</p>
                        <p className={styles.voteCount}>{votes.length}人が投票済み</p>
                        {isHost && (
                            <button
                                className="btn btn-primary"
                                onClick={handleProceedToResult}
                                disabled={loading}
                            >
                                {loading ? '処理中...' : '結果発表へ'}
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
