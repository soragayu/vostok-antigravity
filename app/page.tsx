'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { characters, prologue } from '@/lib/scenario';
import {
  supabase,
  isSupabaseConfigured,
  createRoom,
  joinRoom,
  getRoom,
  getPlayers,
  updateRoom,
  subscribeToRoom,
  subscribeToPlayers,
  generatePlayerId,
  Player
} from '@/lib/supabase';
import { setPlayerInfo, getPlayerInfo, setCookie, getCookie, deleteCookie } from '@/lib/cookies';

type Screen = 'title' | 'intro' | 'prologue' | 'select' | 'room';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [screen, setScreen] = useState<Screen>('title');
  const [playerName, setPlayerName] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 既存のプレイヤー情報を復元
  useEffect(() => {
    const existingPlayer = getPlayerInfo();
    if (existingPlayer) {
      setPlayerName(existingPlayer.name);
      setPlayerId(existingPlayer.id);
    } else {
      setPlayerId(generatePlayerId());
    }

    const savedRoomId = getCookie('room_id');
    if (savedRoomId) {
      // 既存のルームに再接続を試みる
      checkExistingRoom(savedRoomId);
    }
  }, []);

  const checkExistingRoom = async (savedRoomId: string) => {
    const room = await getRoom(savedRoomId);
    if (room && room.phase !== 'result') {
      setRoomId(savedRoomId);
      const roomPlayers = await getPlayers(savedRoomId);
      setPlayers(roomPlayers);

      const existingPlayer = getPlayerInfo();
      if (existingPlayer && roomPlayers.some(p => p.id === existingPlayer.id)) {
        setScreen('room');
        setIsHost(room.host_id === existingPlayer.id);
      }
    }
  };

  // プレイヤーのリアルタイム購読
  useEffect(() => {
    if (!roomId) return;

    const subscription = subscribeToPlayers(roomId, (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [roomId]);

  // ルーム状態のリアルタイム購読（フェーズ進行時の自動遷移）
  useEffect(() => {
    if (!roomId) return;

    const subscription = subscribeToRoom(roomId, (updatedRoom) => {
      if (updatedRoom.phase !== 'waiting' && updatedRoom.phase !== 'result') {
        router.push('/game');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [roomId, router]);

  const handleStart = () => {
    setScreen('intro');
  };

  const handleIntroComplete = () => {
    setScreen('prologue');
  };

  const handlePrologueComplete = () => {
    setScreen('select');
  };

  const handleSelectComplete = () => {
    if (!playerName.trim()) {
      setError('名前を入力してください');
      return;
    }
    if (selectedCharacter === null) {
      setError('キャラクターを選択してください');
      return;
    }
    setError('');
    setScreen('room');
  };

  const handleLeaveRoom = () => {
    deleteCookie('room_id');
    setRoomId('');
    setPlayers([]);
    setIsHost(false);
    setScreen('title');
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');

    try {
      const room = await createRoom(playerId);
      if (!room) {
        setError('ルーム作成に失敗しました');
        setLoading(false);
        return;
      }

      const player = await joinRoom(room.id, playerId, playerName, selectedCharacter);
      if (!player) {
        setError('ルーム参加に失敗しました');
        setLoading(false);
        return;
      }

      setPlayerInfo({ id: playerId, name: playerName, characterId: selectedCharacter });
      setCookie('room_id', room.id);

      setRoomId(room.id);
      setIsHost(true);
      setPlayers([player]);
    } catch (err) {
      console.error(err);
      setError('エラーが発生しました');
    }

    setLoading(false);
  };

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) {
      setError('ルームIDを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const room = await getRoom(joinRoomId.toUpperCase());
      if (!room) {
        setError('ルームが見つかりません');
        setLoading(false);
        return;
      }

      const existingPlayers = await getPlayers(room.id);
      if (existingPlayers.length >= 4) {
        setError('ルームが満員です');
        setLoading(false);
        return;
      }

      // 既に選ばれているキャラクターをチェック
      const takenCharacters = existingPlayers.map(p => p.character_id);
      if (selectedCharacter && takenCharacters.includes(selectedCharacter)) {
        setError('そのキャラクターは既に選ばれています');
        setLoading(false);
        return;
      }

      const player = await joinRoom(room.id, playerId, playerName, selectedCharacter);
      if (!player) {
        setError('ルーム参加に失敗しました');
        setLoading(false);
        return;
      }

      setPlayerInfo({ id: playerId, name: playerName, characterId: selectedCharacter });
      setCookie('room_id', room.id);

      setRoomId(room.id);
      setPlayers([...existingPlayers, player]);
    } catch (err) {
      console.error(err);
      setError('エラーが発生しました');
    }

    setLoading(false);
  };

  const handleStartGame = async () => {
    // デモモードでは1人からでもOK
    if (players.length < 1) {
      setError('プレイヤーが必要です');
      return;
    }

    setLoading(true);

    try {
      const success = await updateRoom(roomId, {
        phase: 'discussion1',
        timer_start: new Date().toISOString()
      });

      if (!success) {
        setError('ゲーム開始に失敗しました');
        setLoading(false);
        return;
      }

      router.push('/game');
    } catch (err) {
      console.error(err);
      setError('エラーが発生しました');
    }

    setLoading(false);
  };

  const getAvailableCharacters = () => {
    const takenIds = players.map(p => p.character_id);
    return characters.filter(c => !takenIds.includes(c.id));
  };

  return (
    <div className={`${styles.container} light-theme`}>
      {/* 背景煙エフェクト */}
      <div className={styles.smokeOverlay}>
        <Image
          src="/images/smoke-light.png"
          alt=""
          fill
          style={{ objectFit: 'cover', opacity: 0.8 }}
          priority
        />
      </div>

      {/* タイトル画面 */}
      {screen === 'title' && (
        <div className={styles.titleScreen}>
          <div className={styles.titleContent}>
            <h1 className={`${styles.title} title-display`}>
              Vostok
            </h1>
            <p className={styles.subtitle}>- SPAGUI. I. -</p>
            {!isSupabaseConfigured && mounted && (
              <p className={styles.demoWarning}>
                ※現在デモモードです（複数デバイス間の同期には Supabase が必要です）
              </p>
            )}
            <button className={`btn btn-primary ${styles.startBtn}`} onClick={handleStart}>
              ゲームを始める
            </button>
          </div>
        </div>
      )}

      {/* キャラクター紹介 */}
      {screen === 'intro' && (
        <div className={styles.introScreen}>
          <h2 className={`${styles.sectionTitle} title-display`}>登場人物</h2>
          <div className={styles.characterGrid}>
            {characters.map((char) => (
              <div key={char.id} className={`${styles.characterCard} card card-hover`}>
                <div className={styles.silhouetteContainer}>
                  <Image
                    src={char.image}
                    alt={char.name}
                    width={100}
                    height={180}
                    style={{ filter: `drop-shadow(0 0 10px ${char.color})`, objectFit: 'contain' }}
                  />
                </div>
                <div className={styles.characterInfo}>
                  <h3 style={{ color: char.color }}>{char.name}</h3>
                  <p className={styles.role}>{char.role}</p>
                  <p className={styles.description}>{char.description}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleIntroComplete}>
            物語を読む
          </button>
        </div>
      )}

      {/* プロローグ */}
      {screen === 'prologue' && (
        <div className={styles.prologueScreen}>
          <h2 className={`${styles.sectionTitle} title-display`}>プロローグ</h2>
          <div className={`${styles.prologueText} card`}>
            {prologue.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handlePrologueComplete}>
            キャラクター選択へ
          </button>
        </div>
      )}

      {/* キャラクター選択 */}
      {screen === 'select' && (
        <div className={styles.selectScreen}>
          <h2 className={`${styles.sectionTitle} title-display`}>キャラクター選択</h2>
          <div className="card" style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <p className={styles.instruction}>あなたの役割を選択してください。一度選ぶと変更できません。</p>
          </div>

          <div className={styles.nameInput}>
            <label>あなたの名前</label>
            <input
              type="text"
              className="input"
              placeholder="名前を入力..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>

          <div className={styles.characterSelect}>
            {characters.map((char) => (
              <div
                key={char.id}
                className={`${styles.selectCard} card card-hover ${selectedCharacter === char.id ? styles.selected : ''}`}
                onClick={() => setSelectedCharacter(char.id)}
                style={{ '--char-color': char.color } as React.CSSProperties}
              >
                <div className={styles.silhouetteSmall}>
                  <Image
                    src={char.image}
                    alt={char.name}
                    width={50}
                    height={85}
                    style={{ filter: `drop-shadow(0 0 5px ${char.color})`, objectFit: 'contain' }}
                  />
                </div>
                <div className={styles.selectInfo}>
                  <h3>{char.name}</h3>
                  <p>{char.role}</p>
                </div>
              </div>
            ))}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className="btn btn-primary" onClick={handleSelectComplete}>
            ルーム作成/参加へ
          </button>
        </div>
      )}

      {/* ルーム */}
      {screen === 'room' && (
        <div className={styles.roomScreen}>
          {!roomId ? (
            <>
              <h2 className={`${styles.sectionTitle} title-display`}>ルーム</h2>
              <div className={styles.roomOptions}>
                <div className={`${styles.roomOption} card`}>
                  <h3>新規ルームを作成</h3>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateRoom}
                    disabled={loading}
                  >
                    {loading ? '作成中...' : '作成する'}
                  </button>
                </div>
                <div className={`${styles.roomOption} card`}>
                  <h3>既存ルームに参加</h3>
                  <input
                    type="text"
                    className="input"
                    placeholder="ルームID"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    style={{ marginBottom: '1rem' }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleJoinRoom}
                    disabled={loading}
                  >
                    {loading ? '参加中...' : '参加する'}
                  </button>
                </div>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </>
          ) : (
            <>
              <h2 className={`${styles.sectionTitle} title-display`}>ルーム</h2>
              <div className={styles.roomIdDisplay}>
                <span className={styles.roomIdLabel}>ルームID:</span>
                <span className={styles.roomIdValue}>{roomId}</span>
              </div>
              <div className={`${styles.roomInfo} card`}>
                <h3>参加者 ({players.length}/4)</h3>
                <div className={styles.playerList}>
                  {players.map((player) => {
                    const char = characters.find(c => c.id === player.character_id);
                    return (
                      <div key={player.id} className={styles.playerItem}>
                        <span className={styles.playerName}>{player.name}</span>
                        {char && <span style={{ color: char.color }}>{char.name}</span>}
                      </div>
                    );
                  })}
                  {Array.from({ length: 4 - players.length }).map((_, i) => (
                    <div key={`empty-${i}`} className={`${styles.playerItem} ${styles.empty}`}>
                      待機中...
                    </div>
                  ))}
                </div>
                {error && <p className={styles.error}>{error}</p>}
                {isHost && (
                  <button
                    className="btn btn-primary"
                    onClick={handleStartGame}
                    disabled={loading || players.length < 1}
                    style={{ marginTop: '1rem' }}
                  >
                    {loading ? '開始中...' : 'ゲーム開始'}
                  </button>
                )}
                {!isHost && (
                  <p className={styles.waitingText}>ホストがゲームを開始するのを待っています...</p>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={handleLeaveRoom}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  ルームを退出する
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
