import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gamepad2, Users, Smartphone, Trophy } from "lucide-react";

const Index = () => {
  const [gameMode, setGameMode] = useState<'menu' | 'join' | 'create'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleStartLocalGame = () => {
    // Start a local game (pass phone around)
    window.location.hash = '/game?mode=local';
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    // Generate room code and redirect to game
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.location.hash = `/game?mode=online&room=${code}&player=${encodeURIComponent(playerName)}`;
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    window.location.hash = `/game?mode=online&room=${roomCode.toUpperCase()}&player=${encodeURIComponent(playerName)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 animate-bounce-in">
          <h1 className="text-6xl font-bold bg-gradient-party bg-clip-text text-transparent">
            What Are
          </h1>
          <h1 className="text-6xl font-bold bg-gradient-party bg-clip-text text-transparent -mt-2">
            The Odds?
          </h1>
          <p className="text-xl text-muted-foreground max-w-md mx-auto">
            The ultimate dare game for parties, hangouts, and good times!
          </p>
        </div>

        {/* Game Mode Selection */}
        {gameMode === 'menu' && (
          <div className="grid gap-6 animate-bounce-in">
            <Card className="bg-gradient-card shadow-card border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Smartphone className="w-6 h-6 text-primary" />
                  Pass the Phone
                </CardTitle>
                <CardDescription>
                  Perfect for when you're all together. Take turns with one device!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="party" 
                  size="xl" 
                  className="w-full"
                  onClick={handleStartLocalGame}
                >
                  Start Local Game
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card shadow-card border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-secondary" />
                  Multi-Device Play
                </CardTitle>
                <CardDescription>
                  Everyone uses their own phone. Create or join a room!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="w-full"
                  onClick={() => setGameMode('create')}
                >
                  Create Room
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full"
                  onClick={() => setGameMode('join')}
                >
                  Join Room
                </Button>
              </CardContent>
            </Card>

            {/* Game Rules */}
            <Card className="bg-gradient-card shadow-card border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-accent" />
                  How to Play
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <p><strong>1. The Dare:</strong> Player A dares Player B to do something</p>
                  <p><strong>2. Set Odds:</strong> Player B chooses odds like "1 in 10"</p>
                  <p><strong>3. Count Down:</strong> Both say a number in that range</p>
                  <p><strong>4. Match = Dare!</strong> Same number means do the dare!</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create Room */}
        {gameMode === 'create' && (
          <Card className="bg-gradient-card shadow-card animate-bounce-in">
            <CardHeader>
              <CardTitle>Create a Room</CardTitle>
              <CardDescription>
                Start a new game room for your friends to join
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Your Name</Label>
                <Input
                  id="create-name"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="dare" 
                  size="lg"
                  className="flex-1"
                  onClick={handleCreateRoom}
                  disabled={!playerName.trim()}
                >
                  Create Room
                </Button>
                <Button 
                  variant="ghost" 
                  size="lg"
                  onClick={() => setGameMode('menu')}
                >
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Join Room */}
        {gameMode === 'join' && (
          <Card className="bg-gradient-card shadow-card animate-bounce-in">
            <CardHeader>
              <CardTitle>Join a Room</CardTitle>
              <CardDescription>
                Enter the room code to join an existing game
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-name">Your Name</Label>
                <Input
                  id="join-name"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-code">Room Code</Label>
                <Input
                  id="room-code"
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="text-center text-lg font-mono"
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="dare" 
                  size="lg"
                  className="flex-1"
                  onClick={handleJoinRoom}
                  disabled={!playerName.trim() || !roomCode.trim()}
                >
                  Join Room
                </Button>
                <Button 
                  variant="ghost" 
                  size="lg"
                  onClick={() => setGameMode('menu')}
                >
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;