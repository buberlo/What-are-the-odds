import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Trophy, Users, Settings, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [gameMode, setGameMode] = useState<'menu' | 'join' | 'create'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Admin login
  const handleAdminLogin = () => {
    if (adminPassword === 'Odds123') {
      navigate('/game?mode=admin');
    } else {
      toast({
        title: "Access Denied",
        description: "Invalid admin password",
        variant: "destructive",
      });
    }
  };

  // Show leaderboard
  const showLeaderboard = () => {
    const leaderboard = JSON.parse(localStorage.getItem('gameLeaderboard') || '[]');
    if (leaderboard.length === 0) {
      toast({
        title: "No Games Yet",
        description: "Play some games to see the leaderboard!",
      });
      return;
    }
    setIsLeaderboardOpen(true);
  };

  const handleStartLocalGame = () => {
    navigate('/game?mode=local');
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/game?mode=online&room=${code}&player=${encodeURIComponent(playerName)}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    navigate(`/game?mode=online&room=${roomCode.toUpperCase()}&player=${encodeURIComponent(playerName)}`);
  };

  const leaderboard = JSON.parse(localStorage.getItem('gameLeaderboard') || '[]');

  return (
    <div className="min-h-screen bg-gradient-bg">
      {/* Top Navigation Bar */}
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold bg-gradient-party bg-clip-text text-transparent">
                What Are The Odds?
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <Tabs defaultValue="local" className="w-auto">
                <TabsList className="bg-muted">
                  <TabsTrigger value="local">Local Game</TabsTrigger>
                  <TabsTrigger value="multiplayer" onClick={() => setGameMode('menu')}>Multiplayer</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Button variant="outline" size="sm" onClick={showLeaderboard}>
                <Trophy className="w-4 h-4 mr-2" />
                Leaderboard
              </Button>
              
              <Dialog open={isAdminOpen} onOpenChange={setIsAdminOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Admin Access</DialogTitle>
                    <DialogDescription>
                      Enter admin password to access management features
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="admin-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="admin-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter admin password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        variant="default" 
                        onClick={handleAdminLogin}
                        disabled={!adminPassword.trim()}
                        className="flex-1"
                      >
                        Login
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          setIsAdminOpen(false);
                          setAdminPassword('');
                          setShowPassword(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-2xl space-y-6">
          
          {/* Main Menu - Local Game Only */}
          {gameMode === 'menu' && (
            <div className="space-y-6 animate-bounce-in">
              {/* Local Game Card */}
              <Card className="bg-gradient-card shadow-card border-primary/20 hover:border-primary transition-colors">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-3 text-2xl">
                    <Smartphone className="w-8 h-8 text-primary" />
                    Pass the Phone Game
                  </CardTitle>
                  <CardDescription className="text-lg">
                    Perfect for when you're all together. Take turns with one device!
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button 
                    variant="default" 
                    size="xl" 
                    className="w-full text-lg h-14 bg-primary hover:bg-primary/90 shadow-button"
                    onClick={handleStartLocalGame}
                  >
                    Start Local Game
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
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <p><strong className="text-primary">1. The Dare:</strong> Player A dares Player B to do something</p>
                      <p><strong className="text-secondary">2. Set Odds:</strong> Player B chooses odds like "1 in 10"</p>
                    </div>
                    <div className="space-y-2">
                      <p><strong className="text-accent">3. Count Down:</strong> Both say a number in that range</p>
                      <p><strong className="text-dare-accent">4. Match = Dare!</strong> Same number means do the dare!</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Create Room */}
          {gameMode === 'create' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-secondary" />
                  Create a Room
                </CardTitle>
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
                    variant="default" 
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
                <CardTitle className="flex items-center gap-3">
                  <Users className="w-6 h-6 text-secondary" />
                  Join a Room
                </CardTitle>
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
                    variant="default" 
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

      {/* Leaderboard Dialog */}
      <Dialog open={isLeaderboardOpen} onOpenChange={setIsLeaderboardOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Game Leaderboard
            </DialogTitle>
            <DialogDescription>
              Winners and their completed dares
            </DialogDescription>
          </DialogHeader>
          {leaderboard.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No games played yet!</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((entry: any, index: number) => (
                <div key={index} className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-primary">#{index + 1} {entry.winner}</span>
                    <span className="text-sm text-muted-foreground">{entry.date}</span>
                  </div>
                  <p className="text-sm">{entry.dare}</p>
                  <div className="text-xs text-muted-foreground">
                    Target: {entry.target} • Odds: 1 in {entry.odds} • Numbers: {entry.challengerNumber} vs {entry.targetNumber}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;