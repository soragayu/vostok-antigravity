'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { correctAnswer } from '@/lib/scenario';
import { getVotes, deleteVote, Vote, getPlayers, Player } from '@/lib/supabase';
import { getPlayerInfo, getCookie, deleteCookie } from '@/lib/cookies';

export default function ResultPage() {
    const router = useRouter();
    const [playerInfo] = useState(getPlayerInfo());
    const [votes, setVotes] = useState<Vote[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    const roomId = getCookie('room_id');

    useEffect(() => {
        if (!roomId || !playerInfo) {
            router.push('/');
            return;
        }

        const loadData = async () => {
            const [votesData, playersData] = await Promise.all([
                getVotes(roomId),
                getPlayers(roomId)
            ]);
            setVotes(votesData);
            setPlayers(playersData);
            setLoading(false);
        };

        loadData();
    }, [roomId, playerInfo, router]);

    if (loading || !playerInfo) {
        return <div className={styles.loading}>読み込み中...</div>;
    }



    // 擬似乱数生成（全員同じ結果になるようにroomIdをシードにする）
    const pseudoRandom = (seed: string) => {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    };

    // 多数決集計ロジック
    const getConsensus = (votes: Vote[], seed: string) => {
        if (votes.length === 0) return null;

        const countVotes = (extractor: (v: Vote) => number) => {
            const counts: Record<number, number> = {};
            votes.forEach(v => {
                const val = extractor(v);
                counts[val] = (counts[val] || 0) + 1;
            });
            return counts;
        };

        const resolveTie = (counts: Record<number, number>, salt: string): number => {
            let maxCount = 0;
            Object.values(counts).forEach(c => maxCount = Math.max(maxCount, c));

            // 最多得票の選択肢をすべて取得
            const candidates = Object.keys(counts)
                .map(Number)
                .filter(k => counts[k] === maxCount)
                .sort((a, b) => a - b); // ID順でソートして固定

            if (candidates.length === 1) return candidates[0];

            // 同点の場合はランダム（ シード + 特定のソルト で決定）
            const rand = pseudoRandom(seed + salt);
            return candidates[rand % candidates.length];
        };

        const whoCounts = countVotes(v => v.who);
        const whereCounts = countVotes(v => v.where_location);
        const whatCounts = countVotes(v => v.what_item);
        const toWhomCounts = countVotes(v => v.to_whom);

        return {
            who: resolveTie(whoCounts, 'who'),
            where: resolveTie(whereCounts, 'where'),
            what: resolveTie(whatCounts, 'what'),
            toWhom: resolveTie(toWhomCounts, 'toWhom')
        };
    };

    const consensus = getConsensus(votes, roomId || '');

    const isCorrect = consensus ? (
        consensus.who === correctAnswer.who &&
        consensus.where === correctAnswer.where &&
        consensus.what === correctAnswer.what &&
        consensus.toWhom === correctAnswer.toWhom
    ) : false;

    const handleRestart = () => {
        deleteCookie('game_state');
        deleteCookie('player_info');
        deleteCookie('room_id');
        router.push('/');
    };

    const handleRetry = async () => {
        if (roomId && playerInfo) {
            await deleteVote(roomId, playerInfo.id);
            router.push('/game/vote');
        }
    };

    return (
        <div className={`${styles.container} ${isCorrect ? 'light-theme' : ''}`}>
            {/* 背景煙エフェクト */}
            <div className={styles.backgroundOverlay}>
                <Image
                    src={isCorrect ? "/images/smoke-light.png" : "/images/smoke-dark.png"}
                    alt=""
                    fill
                    style={{
                        objectFit: 'cover',
                        opacity: isCorrect ? 0.8 : 0.4
                    }}
                    priority
                />
            </div>

            {/* エンディング表示 */}
            <main className={styles.endingMain}>
                <div className={styles.ending}>
                    <h1 className={`${styles.endingTitle} ${isCorrect ? styles.trueTitle : styles.badTitle}`}>
                        {isCorrect ? 'TRUTH REVEALED' : 'BAD END'}
                    </h1>
                    <div className={`card ${styles.endingCard}`} style={{ background: isCorrect ? 'rgba(255, 255, 255, 0.8)' : undefined }}>
                        {isCorrect ? (
                            <div className={styles.trueEndingContent}>
                                <p>宇宙船に低く不気味な声が響いた。黒カモメだ。<br /><br />
                                    「スイッチはこの俺が持っている。起動は地球へ向けた。着陸した瞬間、毒ガス爆弾を爆発させてやる。」<br /><br />
                                    冷たい声が館内を満たし、空気が凍り付く。操縦室は内側から固くロックされ、近づくことさえできない。<br />
                                    地球が迫る。時間は残されていない────。<br /><br />
                                    重苦しい沈黙の中エウロパが口を開いた。<br />
                                    「...わたしに任せて」<br /><br />
                                    体が透ける、自分だけの特異体質。<br />
                                    故郷では異端として疎まれ、居場所を失った力<br />
                                    ────でも今、この仲間たちのためなら、怖くない。<br /><br />
                                    ルナが麻酔銃を差し出す。<br />
                                    「信じてる。エウロパならきっとできる」<br />
                                    イオとカレンも静かにうなずいた。<br />
                                    そこにはただ仲間を信じる、揺るがぬ思いだけがあった。<br /><br />
                                    エウロパは麻酔銃を握り、壁に向かって歩みだす。<br />
                                    その体がゆっくりと溶けてゆく。<br />
                                    装備も髪も、指先さえも光に溶け、壁をこえていく────。<br /><br />
                                    黒カモメがモニターの前で振り返った瞬間<br />
                                    「これで終わり！」<br />
                                    引き金を引く。黒カモメが崩れ落ちた。<br /><br />
                                    ────カシャン、とロックが外れる音が響く。<br />
                                    扉が開き、仲間たちが駆け込む。<br /><br />
                                    重く閉ざされていた扉の向こう、真っ暗な宇宙が広がっていた。<br />
                                    だがその中に、一筋の青い星が光っている。<br /><br />
                                    ────そのあと、操縦席に座ったイオが、みんなに問いかける。<br />
                                    「軌道は地球に向いている。このまま帰ろう...いいね？」<br /><br />
                                    だれも反対しなかった。カレンがはっきりといった。<br />
                                    「...たとえ、動けなくなっても！それでも、みんなと一緒に地球に帰りたい」<br /><br />
                                    その瞬間────<br />
                                    窓の外に、白い光が舞い降りた。<br />
                                    一羽の白いカモメ。<br />
                                    その羽ばたきが、柔らかな光となって体中を満たしていく。<br /><br />
                                    光は暖かく、やさしく、すべてを包み込む。<br />
                                    カレンの苦しみが消え、3人の体から異質なものが洗い流されていく。<br />
                                    それぞれの体が人間に代わっていくのがわかった。<br /><br />
                                    やがて、船は大気圏を抜け、懐かしい青い星に降り立った。<br />
                                    黒いカモメは拘束され、白いカモメは静かにどこともなく飛び立った。<br /><br />
                                    地球の空気をいっぱいに吸い込みながら、私たちは確かに感じていた。<br />
                                    ────この旅の終わりが、仲間と進んだ未来そのものなのだと。</p>
                            </div>
                        ) : (
                            <div className={styles.badEndingContent}>
                                <p>宇宙船中に低く暗い声が響く。<br /><br />
                                    「残念だったな。お前たちの選択じゃ俺は止められない！」<br /><br />
                                    船は地球へ向かう。<br />
                                    誰もそれを止めることはできない。カレンの息が荒くなり、青い星が近づくたびに体が動かなくなっていった。<br /><br />
                                    ――このままでは、地球も、仲間も救えない。<br /><br />
                                    だが、どこかで小さく声がした。<br />
                                    「……もう一度、考え直そう」<br /><br />
                                    時間が巻き戻るように、船内が静まり返り、白い光に包まれる…<br />
                                    今なら、まだやり直せるかもしれない。<br />
                                    ――正しい選択を、もう一度。</p>
                            </div>
                        )}
                    </div>

                    {isCorrect ? (
                        <button className="btn btn-primary" onClick={handleRestart}>
                            タイトルに戻る
                        </button>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button className="btn btn-primary" onClick={handleRetry}>
                                投票に戻る
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
