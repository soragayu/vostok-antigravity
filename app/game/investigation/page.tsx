'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { locations } from '@/lib/scenario';
import {
    supabase,
    getRoom,
    updateRoom,
    updatePlayer,
    getPlayers,
    subscribeToRoom,
    subscribeToPlayers,
    Player,
    Room
} from '@/lib/supabase';
import { getPlayerInfo, getCookie } from '@/lib/cookies';

export default function InvestigationPage() {
    const router = useRouter();
    const [playerInfo] = useState(getPlayerInfo());
    const [players, setPlayers] = useState<Player[]>([]);
    const [room, setRoom] = useState<Room | null>(null);
    const [selectedLocations, setSelectedLocations] = useState<number[]>([]);
    const [investigationComplete, setInvestigationComplete] = useState(false);
    const [foundItems, setFoundItems] = useState<{ name: string; description: string }[]>([]);
    const [loading, setLoading] = useState(false);

    const roomId = getCookie('room_id');

    useEffect(() => {
        if (!roomId || !playerInfo) {
            router.push('/');
            return;
        }

        // ルームのフェーズ変更を監視
        const roomSubscription = subscribeToRoom(roomId, (updatedRoom) => {
            setRoom(updatedRoom);
            if (!['investigation1', 'investigation2'].includes(updatedRoom.phase)) {
                router.push('/game');
            }
        });

        // プレイヤー情報を監視（他人の捜査状況をリアルタイム反映）
        const playersSubscription = subscribeToPlayers(roomId, (updatedPlayers) => {
            setPlayers(updatedPlayers);
        });

        const initLoad = async () => {
            const [roomData, playersData] = await Promise.all([
                getRoom(roomId),
                getPlayers(roomId)
            ]);
            setRoom(roomData);
            setPlayers(playersData);
        };
        initLoad();

        return () => {
            roomSubscription.unsubscribe();
            playersSubscription.unsubscribe();
        };
    }, [roomId, playerInfo, router]);

    const getInvestigationConfig = (phase: string) => {
        const isFirst = phase === 'investigation1';
        return {
            targetStage: isFirst ? 1 : 2,
            maxSearchesPerLoc: isFirst ? 2 : 1,
            maxSelectable: isFirst ? 2 : 1
        };
    };

    const handleLocationClick = (locationId: number) => {
        if (investigationComplete || !room) return;

        const config = getInvestigationConfig(room.phase);
        const allFoundItemIds = players.flatMap(p => p.items || []);
        const location = locations.find(l => l.id === locationId);

        // その場所で、現在のターゲットステージのアイテムがいくつ見つかっているか
        const foundCount = location?.items.filter(item =>
            item.stage === config.targetStage && allFoundItemIds.includes(item.id)
        ).length || 0;

        // この場所を既に選択している数
        const selectionCount = selectedLocations.filter(id => id === locationId).length;

        // 追加可能か判定 (場所ごとの上限チェック & 全体の上限チェック)
        // 場所ごとの上限: 既に発見済み + 今回の選択数 < 上限
        const canAddThisLoc = (foundCount + selectionCount) < config.maxSearchesPerLoc;
        const canAddTotal = selectedLocations.length < config.maxSelectable;

        if (canAddThisLoc && canAddTotal) {
            // 追加
            setSelectedLocations(prev => [...prev, locationId]);
        } else {
            // 追加できない場合（上限到達時）は、選択済みなら1つ減らす（サイクリックな操作感）
            if (selectionCount > 0) {
                const index = selectedLocations.indexOf(locationId);
                if (index > -1) {
                    const newLocs = [...selectedLocations];
                    newLocs.splice(index, 1);
                    setSelectedLocations(newLocs);
                }
            }
        }
    };

    const handleInvestigate = async () => {
        if (selectedLocations.length === 0 || !playerInfo?.id || !roomId || !room) return;

        setLoading(true);

        const config = getInvestigationConfig(room.phase);
        const allPlayers = await getPlayers(roomId);
        const allFoundItemIds = allPlayers.flatMap(p => p.items || []);
        const itemsToFind: { id: number; name: string; description: string }[] = [];
        const foundInBatch: number[] = []; // このバッチで見つけたアイテムIDを記録（重複防止）

        selectedLocations.forEach(locId => {
            const location = locations.find(l => l.id === locId);
            if (location) {
                // 現在のステージのアイテムのうち、まだ誰も見つけていないものを1つだけ探す
                // foundInBatch に含まれるものも除外する
                const nextItem = location.items
                    .filter(item =>
                        item.stage === config.targetStage &&
                        !allFoundItemIds.includes(item.id) &&
                        !foundInBatch.includes(item.id)
                    )
                    .sort((a, b) => a.id - b.id)[0];

                if (nextItem) {
                    itemsToFind.push({ id: nextItem.id, name: nextItem.name, description: nextItem.description });
                    foundInBatch.push(nextItem.id);
                }
            }
        });

        // プレイヤーのアイテムを更新
        const currentPlayer = allPlayers.find(p => p.id === playerInfo.id);
        if (currentPlayer) {
            const newItems = [...(currentPlayer.items || [])];
            itemsToFind.forEach(item => {
                if (!newItems.includes(item.id)) {
                    newItems.push(item.id);
                }
            });

            // 捜査完了フラグアイテムを追加 (Investigation 1: 901, Investigation 2: 902)
            const flagId = room.phase === 'investigation1' ? 901 : 902;
            if (!newItems.includes(flagId)) {
                newItems.push(flagId);
            }

            await updatePlayer(playerInfo.id, { items: newItems });
        }

        setFoundItems(itemsToFind);
        setInvestigationComplete(true);
        setLoading(false);
    };

    const handleReturn = async () => {
        if (!roomId) return;

        setLoading(true);

        const roomData = await getRoom(roomId);
        if (roomData && roomData.host_id === playerInfo?.id) {
            // ホストの場合、次のフェーズへ
            const nextPhase = roomData.phase === 'investigation1' ? 'discussion2' : 'discussion4';
            await updateRoom(roomId, {
                phase: nextPhase,
                timer_start: new Date().toISOString()
            });
        }

        router.push('/game');
    };

    if (!playerInfo || !room || players.length === 0) {
        return <div className={styles.loading}>読み込み中...</div>;
    }

    const config = getInvestigationConfig(room.phase);
    const allFoundItemIds = players.flatMap(p => p.items || []);

    const isLightBackground = room.phase !== 'investigation2';

    return (
        <div className={`${styles.container} ${isLightBackground ? 'light-theme' : ''}`}>
            {/* 背景 */}
            <div className={styles.backgroundOverlay}>
                <Image
                    src={room.phase === 'investigation2' ? "/images/smoke-dark.png" : "/images/smoke-light.png"}
                    alt=""
                    fill
                    style={{
                        objectFit: 'cover',
                        opacity: room.phase === 'investigation2' ? 0.4 : 0.8
                    }}
                />
            </div>
            <header className={styles.header}>
                <h1>捜査フェーズ</h1>
                <p className={styles.instruction}>
                    {investigationComplete
                        ? '捜査が完了しました！'
                        : `調べたい場所を${config.maxSelectable}箇所まで選択してください`}
                </p>
            </header>

            <main className={styles.main}>
                {!investigationComplete ? (
                    <>
                        <div className={styles.locationGrid}>
                            {locations.filter(loc => loc.id !== 5 && loc.id !== 6).map(loc => {
                                const foundInThisLoc = loc.items.filter(item =>
                                    item.stage === config.targetStage && allFoundItemIds.includes(item.id)
                                ).length;
                                const isSearchedMax = foundInThisLoc >= config.maxSearchesPerLoc;

                                return (
                                    <div
                                        key={loc.id}
                                        className={`${styles.locationCard} ${selectedLocations.includes(loc.id) ? styles.selected : ''} ${isSearchedMax ? styles.disabled : ''}`}
                                        onClick={() => handleLocationClick(loc.id)}
                                    >
                                        <div className={styles.searchMeter}>
                                            <span className={styles.meterCount}>調査回数(今期): {foundInThisLoc}/{config.maxSearchesPerLoc}</span>
                                            <div className={styles.meterBar}>
                                                <div className={styles.meterFill} style={{ width: `${(foundInThisLoc / config.maxSearchesPerLoc) * 100}%` }}></div>
                                            </div>
                                        </div>
                                        <h3>{loc.name}</h3>
                                        <p>{loc.description}</p>
                                        {isSearchedMax && <span className={styles.searchedBadge}>調査終了</span>}
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.selectionInfo}>
                            選択中: {selectedLocations.length} / {config.maxSelectable}
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleInvestigate}
                            disabled={selectedLocations.length === 0 || loading}
                            style={isLightBackground ? {
                                backgroundColor: '#4f46e5',
                                color: '#ffffff',
                                border: '2px solid #000000',
                                fontWeight: 'bold'
                            } : {}}
                        >
                            {loading ? '捜査中...' : '捜査する'}
                        </button>
                    </>
                ) : (
                    <div className={styles.results}>
                        <h2>発見したもの</h2>
                        {foundItems.length === 0 ? (
                            <p className={styles.noItems}>何も見つかりませんでした...</p>
                        ) : (
                            <div className={styles.itemList}>
                                {foundItems.map((item, i) => (
                                    <div key={i} className={`card ${styles.itemCard}`}>
                                        <h3>{item.name}</h3>
                                        <p>{item.description}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 同期待ちロジック */}
                        {(() => {
                            // 全プレイヤーが規定のフラグアイテムを持っているかチェック
                            // Investigation 1: 901, Investigation 2: 902
                            const flagId = room.phase === 'investigation1' ? 901 : 902;

                            const allPlayersFinished = players.every(p => {
                                return p.items?.includes(flagId);
                            });

                            if (!allPlayersFinished) {
                                return (
                                    <div className={styles.waitingMessage}>
                                        <p className={styles.blink}>他プレイヤーの捜査を待っています...</p>
                                        <div className={styles.progressList}>
                                            {players.map(p => {
                                                const isDone = p.items?.includes(flagId);
                                                return (
                                                    <div key={p.id} className={styles.progressItem}>
                                                        <span>{p.name}</span>: {isDone ? '完了 ✅' : '捜査中... 🔍'}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            }

                            if (room.host_id === playerInfo.id) {
                                return (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleReturn}
                                        disabled={loading}
                                        style={isLightBackground ? {
                                            backgroundColor: '#4f46e5',
                                            color: '#ffffff',
                                            border: '2px solid #000000',
                                            fontWeight: 'bold',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                        } : {}}
                                    >
                                        {loading ? '処理中...' : '議論画面に戻る'}
                                    </button>
                                );
                            } else {
                                return (
                                    <p className={styles.waitingText}>ホストが進行するのを待っています...</p>
                                );
                            }
                        })()}
                    </div>
                )}
            </main>
        </div>
    );
}
