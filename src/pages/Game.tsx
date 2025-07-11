import { useEffect, useState } from "react";
import GameRoom from "@/components/GameRoom";

const Game = () => {
  const [gameParams, setGameParams] = useState<{
    mode?: 'local' | 'online';
    room?: string;
    player?: string;
  }>({});

  useEffect(() => {
    // Parse URL parameters from search
    const urlParams = new URLSearchParams(window.location.search);
    
    setGameParams({
      mode: urlParams.get('mode') as 'local' | 'online' || 'local',
      room: urlParams.get('room') || undefined,
      player: urlParams.get('player') ? decodeURIComponent(urlParams.get('player')!) : undefined
    });
  }, []);

  if (!gameParams.mode) {
    return <div>Loading...</div>;
  }

  return (
    <GameRoom 
      mode={gameParams.mode}
      roomCode={gameParams.room}
      playerName={gameParams.player}
    />
  );
};

export default Game;