'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import {
    characters,
    prologue,
    locations,
    getHandouts,
    getItemById
} from '@/lib/scenario';
import {
    supabase,
    getRoom,
    getPlayers,
    getChatMessages,
    sendChatMessage,
    updateRoom,
    subscribeToRoom,
    subscribeToPlayers,
    subscribeToChat,
    Room,
    Player,
    ChatMessage
} from '@/lib/supabase';
import { getPlayerInfo, getCookie, deleteCookie } from '@/lib/cookies';

type Tab = 'handout' | 'map' | 'characters' | 'prologue' | 'items';

const PHASE_LABELS: Record<string, string> = {
    waiting: '待機中',
    prologue: 'プロローグ',
    discussion1: '議論フェーズ 1',
    investigation1: '捜査フェーズ 1',
    discussion2: '議論フェーズ 2',
    additional_handout: '追加ハンドアウト',
    discussion3: '議論フェーズ 3',
    investigation2: '捜査フェーズ 2',
    discussion4: '議論フェーズ 4',
    voting: '投票フェーズ',
    result: '結果発表',
};

const PHASE_TIMER: Record<string, number> = {
    discussion1: 10 * 60, // 10分
    discussion2: 1, // 1秒で暗転演出を開始するように設定
    discussion3: 10 * 60, // 10分に変更
    discussion4: 5 * 60,
};

export default function GamePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('handout');
    const [room, setRoom] = useState<Room | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [playerInfo, setLocalPlayerInfo] = useState(getPlayerInfo());
    const [timer, setTimer] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEroding, setIsEroding] = useState(false);
    const [forceDarkMode, setForceDarkMode] = useState(false);
    const [showAdditionalModal, setShowAdditionalModal] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const roomId = getCookie('room_id');

    // 初期データ取得
    useEffect(() => {
        if (!roomId) {
            router.push('/');
            return;
        }

        const loadData = async () => {
            const [roomData, playersData] = await Promise.all([
                getRoom(roomId),
                getPlayers(roomId)
            ]);

            if (!roomData) {
                router.push('/');
                return;
            }

            setRoom(roomData);
            setPlayers(playersData);

            // 初期表示時のテーマ設定
            if (['discussion3', 'investigation2', 'discussion4', 'voting', 'result', 'additional_handout'].includes(roomData.phase)) {
                setForceDarkMode(true);
            }

            setLoading(false);
        };

        loadData();
    }, [roomId, router]);

    // リアルタイム購読
    useEffect(() => {
        if (!roomId) return;

        const roomSub = subscribeToRoom(roomId, (updatedRoom) => {
            setRoom(updatedRoom);

            // 追加ハンドアウト移行時の演出
            if (updatedRoom.phase === 'additional_handout') {
                setIsEroding(true);
                // 2.5秒後にテーマをダークに切り替える（画面がより確実に真っ黒な時）
                setTimeout(() => {
                    setForceDarkMode(true);
                    setShowAdditionalModal(true);
                }, 2500);
                // 5秒後にオーバーレイを消す
                setTimeout(() => setIsEroding(false), 5000);
            } else if (['discussion3', 'investigation2', 'discussion4', 'voting', 'result'].includes(updatedRoom.phase)) {
                setForceDarkMode(true);
            } else {
                setForceDarkMode(false);
            }

            // フェーズ変更時の画面遷移
            if (updatedRoom.phase === 'investigation1' || updatedRoom.phase === 'investigation2') {
                router.push('/game/investigation');
            } else if (updatedRoom.phase === 'voting') {
                router.push('/game/vote');
            } else if (updatedRoom.phase === 'result') {
                router.push('/result');
            }
        });

        const playersSub = subscribeToPlayers(roomId, setPlayers);

        return () => {
            roomSub.unsubscribe();
            playersSub.unsubscribe();
        };
    }, [roomId, router]);

    // タイマー更新
    useEffect(() => {
        if (!room) return;
        const phaseDuration = PHASE_TIMER[room.phase];
        if (!phaseDuration || !room.timer_start) {
            setTimer(null);
            return;
        }

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - new Date(room.timer_start!).getTime()) / 1000);
            const remaining = Math.max(0, phaseDuration - elapsed);
            setTimer(remaining);

        }, 1000);

        return () => clearInterval(interval);
    }, [room]);

    if (loading || !room || !playerInfo) {
        return <div className={styles.loading}>読み込み中...</div>;
    }

    const currentPlayer = players.find(p => p.id === playerInfo.id);
    const currentCharacter = characters.find(c => c.id === currentPlayer?.character_id);

    const handouts = currentPlayer?.character_id
        ? getHandouts(
            currentPlayer.character_id,
            ['additional_handout', 'discussion3', 'investigation2', 'discussion4', 'voting', 'result'].includes(room.phase)
        )
        : [];

    const playerItems = currentPlayer?.items?.map(id => getItemById(id)).filter(Boolean) || [];

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getTimerClass = () => {
        if (!timer) return '';
        if (timer <= 30) return styles.danger;
        if (timer <= 60) return styles.warning;
        return '';
    };

    const handleNextPhase = async () => {
        if (!room || !roomId) return;

        const phaseOrder = [
            'discussion1', 'investigation1', 'discussion2',
            'additional_handout', 'discussion3', 'investigation2',
            'discussion4', 'voting', 'result'
        ];

        const currentIndex = phaseOrder.indexOf(room.phase);
        if (currentIndex >= 0 && currentIndex < phaseOrder.length - 1) {
            const nextPhase = phaseOrder[currentIndex + 1];
            await updateRoom(roomId, {
                phase: nextPhase,
                timer_start: new Date().toISOString()
            });
        }
    };

    const handleReset = () => {
        deleteCookie('room_id');
        router.push('/');
    };

    const isHost = room.host_id === playerInfo.id;

    const isLightBackground = !forceDarkMode;

    return (
        <div className={`${styles.container} ${isLightBackground ? 'light-theme' : ''}`}>
            {/* 背景 */}
            <div className={styles.backgroundOverlay}>
                <Image
                    src={forceDarkMode
                        ? "/images/smoke-dark.png"
                        : "/images/smoke-light.png"}
                    alt=""
                    fill
                    style={{
                        objectFit: 'cover',
                        opacity: forceDarkMode ? 0.4 : 0.8
                    }}
                    priority
                />
            </div>
            {/* ヘッダー */}
            <header className={styles.header}>
                <div className={styles.phaseInfo}>
                    <div className={styles.phaseIndicator}>
                        <span className={styles.phaseDot}></span>
                        <span className={styles.phaseLabel}>{PHASE_LABELS[room.phase] || room.phase}</span>
                    </div>
                    {/* タイマー表示は削除 */}
                </div>
                <div className={styles.playerInfo}>
                    <span className={styles.playerCharacter} style={{ color: currentCharacter?.color }}>
                        {currentCharacter?.name}
                    </span>
                    <button className={styles.resetBtn} onClick={handleReset} title="タイトルに戻る">
                        ✕
                    </button>
                </div>
            </header>

            {/* タブナビゲーション */}
            <nav className={styles.tabs}>
                {[
                    { id: 'handout', label: 'ハンドアウト' },
                    { id: 'map', label: 'マップ' },
                    { id: 'characters', label: 'キャラクター' },
                    { id: 'prologue', label: 'プロローグ' },
                    { id: 'items', label: 'アイテム' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
                        onClick={() => setActiveTab(tab.id as Tab)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* メインコンテンツ */}
            <main className={styles.main}>
                {/* 議論時間の目安表示 */}
                {(room.phase.startsWith('discussion') || room.phase === 'additional_handout') && (
                    <div className="card" style={{
                        marginBottom: '1.5rem',
                        padding: '1rem',
                        textAlign: 'center',
                        borderLeft: '4px solid var(--accent-primary)',
                        backgroundColor: forceDarkMode ? '#1a1a2e' : '#ffffff',
                        color: forceDarkMode ? '#e8e8f0' : '#000000',
                        fontWeight: '500',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}>
                        💡 議論時間の目安は10分程度です
                    </div>
                )}

                {/* ハンドアウト */}
                {activeTab === 'handout' && (
                    <div className={styles.content}>
                        <h2>あなたのハンドアウト</h2>
                        {handouts.map((handout, i) => (
                            <div key={i} className={`card ${styles.handoutCard}`}>
                                {handout.type === 'additional' && (
                                    <span className={styles.additionalBadge}>追加情報</span>
                                )}
                                {handout.content.split('\n').map((line, j) => (
                                    <p key={j}>{line}</p>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* マップ */}
                {activeTab === 'map' && (
                    <div className={styles.content}>
                        <h2>船内マップ</h2>
                        <div className={styles.mapImageContainer}>
                            <Image
                                src="/map.jpg"
                                alt="船内マップ"
                                width={800}
                                height={800}
                                className={styles.mapImage}
                                priority
                            />
                        </div>
                    </div>
                )}

                {/* キャラクター */}
                {activeTab === 'characters' && (
                    <div className={styles.content}>
                        <h2>キャラクター情報</h2>
                        <div className={styles.characterList}>
                            {characters.map(char => {
                                const player = players.find(p => p.character_id === char.id);
                                return (
                                    <div key={char.id} className={`card ${styles.characterItem}`}>
                                        <div className={styles.characterAvatar}>
                                            <Image
                                                src={char.image}
                                                alt={char.name}
                                                width={60}
                                                height={100}
                                                style={{ filter: `drop-shadow(0 0 5px ${char.color})`, objectFit: 'contain' }}
                                            />
                                        </div>
                                        <div className={styles.characterDetails}>
                                            <h3 style={{ color: char.color }}>{char.name}</h3>
                                            <p className={styles.role}>{char.role}</p>
                                            <p className={styles.description}>{char.description}</p>
                                            {player && (
                                                <p className={styles.playerLabel}>プレイヤー: {player.name}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* プロローグ */}
                {activeTab === 'prologue' && (
                    <div className={styles.content}>
                        <h2>プロローグ</h2>
                        <div className={`card ${styles.prologueCard}`}>
                            {prologue.split('\n').map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    </div>
                )}

                {/* 所有アイテム */}
                {activeTab === 'items' && (
                    <div className={styles.content}>
                        <h2>所有アイテム</h2>
                        {playerItems.length === 0 ? (
                            <p className={styles.emptyMessage}>まだアイテムを持っていません</p>
                        ) : (
                            <div className={styles.itemList}>
                                {playerItems.map(item => item && (
                                    <div key={item.id} className={`card ${styles.itemCard}`}>
                                        <h3>{item.name}</h3>
                                        <p>{item.description}</p>
                                        <span className={styles.itemLocation}>
                                            発見場所: {locations.find(l => l.id === item.locationId)?.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* フッターアクション: 通常はHostのみだが、Discussion2（暗転前）だけは全員が押せる */}
            {(isHost || room.phase === 'discussion2') && (
                <footer className={styles.footer}>
                    <button
                        className={`btn btn-secondary ${styles.nextPhaseBtn}`}
                        onClick={handleNextPhase}
                        style={isLightBackground ? {
                            backgroundColor: '#ffffff',
                            color: '#000000',
                            border: '2px solid #000000',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        } : {}}
                    >
                        次のフェーズへ
                    </button>
                </footer>
            )}

            {/* 浸食演出オーバーレイ */}
            {isEroding && <div className={styles.erosionOverlay} />}

            {/* 追加ハンドアウト全画面表示 */}
            {showAdditionalModal && (
                <div className={styles.handoutOverlay}>
                    <div className={styles.handoutModalContent}>
                        <div className={styles.handoutHeader}>
                            <span className={styles.handoutBadge}>ADDITIONAL SECRET</span>
                            <h1>新たなハンドアウト</h1>
                        </div>
                        <div className={styles.handoutBody}>
                            {handouts.filter(h => h.type === 'additional').map((handout, i) => (
                                <div key={i} className={styles.handoutText}>
                                    {handout.content.split('\n').map((line, j) => (
                                        <p key={j}>{line}</p>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className={styles.handoutFooter}>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: '#4f46e5', border: '2px solid #ffffff' }}
                                onClick={() => setShowAdditionalModal(false)}
                            >
                                秘密を確認した
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
