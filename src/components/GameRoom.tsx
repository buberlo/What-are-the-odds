import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Timer, Users, Home, Zap, Target, Lightbulb, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  name: string;
  isActive: boolean;
}

interface GameState {
  phase: 'setup' | 'dare' | 'pass-for-odds' | 'odds' | 'pass-for-challenger-number' | 'challenger-number' | 'pass-for-target-number' | 'target-number' | 'final-countdown' | 'result' | 'leaderboard' | 'admin-login' | 'manage-dares';
  challenger?: Player;
  target?: Player;
  dare: string;
  odds: number;
  challengerNumber?: number;
  targetNumber?: number;
  countdownTimer: number;
}

interface LeaderboardEntry {
  winner: string;
  dare: string;
  odds: number;
  timestamp: Date;
}

interface GameRoomProps {
  mode: 'local' | 'online';
  roomCode?: string;
  playerName?: string;
}

const GameRoom = ({ mode, roomCode, playerName }: GameRoomProps) => {
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    phase: 'setup',
    dare: '',
    odds: 10,
    countdownTimer: 10
  });
  const [dareInput, setDareInput] = useState('');
  const [selectedOdds, setSelectedOdds] = useState(10);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  
  const [newDare, setNewDare] = useState('');
  const [predefinedDares, setPredefinedDares] = useState([
    "Text your crush 'What's up?' right now",
    "Do 10 pushups in front of everyone",
    "Sing 'Happy Birthday' at the top of your lungs",
    "Call a random contact and tell them a dad joke",
    "Post an embarrassing selfie on social media",
    "Do your best impression of a celebrity for 1 minute",
    "Eat a spoonful of hot sauce",
    "Dance like nobody's watching for 30 seconds",
    "Tell everyone your most embarrassing moment",
    "Speak in an accent for the next 10 minutes",
    "Do 20 jumping jacks while shouting your name",
    "Let someone else post a status on your social media",
    "Wear your clothes backwards for the next round",
    "Make up a rap about your day",
    "Do your best animal impression for 1 minute"
  ]);

  // Predefined dare suggestions (for backward compatibility)
  const dareSuggestions = predefinedDares;

  // Initialize game based on mode
  useEffect(() => {
    if (mode === 'local') {
      // Local game setup
      setPlayers([
        { id: '1', name: 'Player 1', isActive: true },
        { id: '2', name: 'Player 2', isActive: false }
      ]);
      setCurrentPlayer({ id: '1', name: 'Player 1', isActive: true });
    } else if (mode === 'online' && playerName) {
      // Online game setup
      setPlayers([{ id: 'me', name: playerName, isActive: true }]);
      setCurrentPlayer({ id: 'me', name: playerName, isActive: true });
      
      toast({
        title: "Room Created!",
        description: `Share code: ${roomCode}`,
      });
    }
  }, [mode, roomCode, playerName, toast]);

  const startNewRound = () => {
    setGameState({
      phase: 'dare',
      dare: '',
      odds: 10,
      countdownTimer: 10
    });
    setDareInput('');
    setSelectedOdds(10);
    setSelectedNumber(null);
  };

  const submitDare = () => {
    if (!dareInput.trim()) return;
    
    setGameState(prev => ({
      ...prev,
      phase: mode === 'local' ? 'pass-for-odds' : 'odds',
      dare: dareInput,
      challenger: players[0],
      target: players[1]
    }));
  };

  const submitOdds = () => {
    setGameState(prev => ({
      ...prev,
      phase: mode === 'local' ? 'pass-for-challenger-number' : 'final-countdown',
      odds: selectedOdds
    }));
    
    if (mode !== 'local') {
      startCountdown();
    }
  };

  const startCountdown = () => {
    let timer = 10;
    setGameState(prev => ({ ...prev, countdownTimer: timer }));
    
    const interval = setInterval(() => {
      timer--;
      setGameState(prev => ({ ...prev, countdownTimer: timer }));
      
      if (timer <= 0) {
        clearInterval(interval);
        setGameState(prev => ({ ...prev, phase: 'result' }));
      }
    }, 1000);
  };

  const adminLogin = () => {
    if (adminUsername === 'admin') {
      setAdminMode(true);
      setAdminUsername('');
      toast({
        title: "Admin Access Granted",
        description: "You can now edit dares and leaderboard entries.",
      });
      setGameState(prev => ({ ...prev, phase: 'leaderboard' }));
    } else {
      toast({
        title: "Access Denied",
        description: "Invalid admin credentials.",
        variant: "destructive",
      });
    }
  };

  const addToLeaderboard = (winner: string, dare: string, odds: number) => {
    const entry: LeaderboardEntry = {
      winner,
      dare,
      odds,
      timestamp: new Date()
    };
    setLeaderboard(prev => [entry, ...prev]);
    
    toast({
      title: "Added to Leaderboard!",
      description: `${winner} completed the dare successfully.`,
    });
    
    // Navigate back to main page after a short delay
    setTimeout(() => {
      setGameState(prev => ({ ...prev, phase: 'setup' }));
    }, 1500);
  };

  const deleteLeaderboardEntry = (index: number) => {
    setLeaderboard(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Entry Deleted",
      description: "Leaderboard entry has been removed.",
    });
  };

  const addNewDare = () => {
    if (newDare.trim()) {
      setPredefinedDares(prev => [...prev, newDare.trim()]);
      setNewDare('');
      toast({
        title: "Dare Added",
        description: "New dare has been added to the list.",
      });
    }
  };

  const deleteDare = (index: number) => {
    setPredefinedDares(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Dare Deleted",
      description: "Dare has been removed from the list.",
    });
  };

  const showLeaderboard = () => {
    setGameState(prev => ({ ...prev, phase: 'leaderboard' }));
  };

  const submitChallengerNumber = () => {
    if (selectedNumber === null) return;
    
    setGameState(prev => ({
      ...prev,
      phase: 'pass-for-target-number',
      challengerNumber: selectedNumber
    }));
    setSelectedNumber(null);
  };

  const submitTargetNumber = () => {
    if (selectedNumber === null) return;
    
    setGameState(prev => ({
      ...prev,
      phase: 'final-countdown',
      targetNumber: selectedNumber
    }));
    startCountdown();
  };

  const submitNumber = () => {
    if (selectedNumber === null) return;
    
    // For online mode - simulate both players picking numbers
    const challengerNum = Math.floor(Math.random() * selectedOdds) + 1;
    const targetNum = selectedNumber;
    
    setGameState(prev => ({
      ...prev,
      phase: 'result',
      challengerNumber: challengerNum,
      targetNumber: targetNum
    }));
  };

  const generateNumberGrid = (maxNum: number) => {
    return Array.from({ length: maxNum }, (_, i) => i + 1);
  };

  const goHome = () => {
    window.location.href = '/';
  };

  const isMatch = gameState.challengerNumber === gameState.targetNumber;

  return (
    <div className="min-h-screen bg-gradient-bg p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={goHome}>
              <Home className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-party bg-clip-text text-transparent">
                What Are The Odds?
              </h1>
              {mode === 'online' && roomCode && (
                <Badge variant="secondary" className="mt-1">
                  Room: {roomCode}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Players */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={showLeaderboard}>
              <Trophy className="w-4 h-4 mr-2" />
              Leaderboard
            </Button>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {players.length} player{players.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="space-y-6">
          {/* Setup Phase */}
          {gameState.phase === 'setup' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Ready to Play?
                </CardTitle>
                <CardDescription>
                  Let's start a new round of "What Are The Odds?"
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="party" 
                  size="xl" 
                  className="w-full"
                  onClick={startNewRound}
                >
                  Start New Round
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Dare Phase */}
          {gameState.phase === 'dare' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-game-dare" />
                  Create a Dare
                </CardTitle>
                <CardDescription>
                  Challenge someone to do something fun or daring!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dare">What's the dare?</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setDareInput(dareSuggestions[Math.floor(Math.random() * dareSuggestions.length)])}
                    >
                      <Lightbulb className="w-4 h-4 mr-2" />
                      Random Suggestion
                    </Button>
                  </div>
                  
                  <Textarea
                    id="dare"
                    placeholder="e.g., Text your crush 'What's up?' right now"
                    value={dareInput}
                    onChange={(e) => setDareInput(e.target.value)}
                    className="min-h-[100px]"
                  />
                  
                  {/* Dare suggestions */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Or choose from suggestions:</Label>
                    <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                      {dareSuggestions.slice(0, 6).map((suggestion, index) => (
                        <Button
                          key={index}
                          variant="ghost"
                          size="sm"
                          className="justify-start text-left h-auto p-2 whitespace-normal"
                          onClick={() => setDareInput(suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <Button 
                  variant="dare" 
                  size="lg"
                  className="w-full"
                  onClick={submitDare}
                  disabled={!dareInput.trim()}
                >
                  Submit Dare
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pass Phone for Odds */}
          {gameState.phase === 'pass-for-odds' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">📱 Pass the Phone!</CardTitle>
                <CardDescription>
                  Give the phone to <strong>{gameState.target?.name}</strong> to set their odds
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="p-4 bg-game-bg rounded-lg border border-primary/20 mb-6">
                  <h3 className="font-semibold mb-2">The Dare:</h3>
                  <p className="text-foreground">{gameState.dare}</p>
                </div>
                <Button 
                  variant="secondary" 
                  size="lg"
                  className="w-full"
                  onClick={() => setGameState(prev => ({ ...prev, phase: 'odds' }))}
                >
                  I'm {gameState.target?.name} - Continue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Odds Phase */}
          {gameState.phase === 'odds' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle>Set Your Odds</CardTitle>
                <CardDescription>
                  {mode === 'local' ? `${gameState.target?.name}, how` : 'How'} likely are you to do this dare?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Display the dare */}
                <div className="p-4 bg-game-bg rounded-lg border border-primary/20">
                  <h3 className="font-semibold mb-2">The Dare:</h3>
                  <p className="text-foreground">{gameState.dare}</p>
                </div>

                {/* Odds selector */}
                <div className="space-y-4">
                  <Label>Choose your odds (1 in ...):</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[2, 3, 5, 10, 15, 20].map((odds) => (
                      <Button
                        key={odds}
                        variant={selectedOdds === odds ? "default" : "outline"}
                        size="lg"
                        onClick={() => setSelectedOdds(odds)}
                        className="h-16"
                      >
                        1 in {odds}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="custom-odds" className="whitespace-nowrap">Custom:</Label>
                    <Input
                      id="custom-odds"
                      type="number"
                      min="2"
                      max="100"
                      value={selectedOdds}
                      onChange={(e) => setSelectedOdds(Math.max(2, parseInt(e.target.value) || 2))}
                      className="w-20"
                    />
                  </div>
                </div>

                <Button 
                  variant="secondary" 
                  size="lg"
                  className="w-full"
                  onClick={submitOdds}
                >
                  Lock in Odds: 1 in {selectedOdds}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pass Phone for Challenger Number */}
          {gameState.phase === 'pass-for-challenger-number' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">📱 Pass the Phone!</CardTitle>
                <CardDescription>
                  Give the phone to <strong>{gameState.challenger?.name}</strong> to pick their number
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-4 bg-game-bg rounded-lg border border-primary/20">
                  <h3 className="font-semibold mb-2">The Challenge:</h3>
                  <p className="text-foreground mb-2">{gameState.dare}</p>
                  <Badge variant="secondary">Odds: 1 in {gameState.odds}</Badge>
                </div>
                <Button 
                  variant="dare" 
                  size="lg"
                  className="w-full"
                  onClick={() => setGameState(prev => ({ ...prev, phase: 'challenger-number' }))}
                >
                  I'm {gameState.challenger?.name} - Pick My Number
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Challenger Number Phase */}
          {gameState.phase === 'challenger-number' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle className="text-center">{gameState.challenger?.name}, Pick Your Number!</CardTitle>
                <CardDescription className="text-center">
                  Choose a number between 1 and {gameState.odds}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-5 gap-3 max-w-md mx-auto">
                  {generateNumberGrid(Math.min(gameState.odds, 20)).map((num) => (
                    <Button
                      key={num}
                      variant={selectedNumber === num ? "default" : "number"}
                      size="number"
                      onClick={() => setSelectedNumber(num)}
                      className="aspect-square"
                    >
                      {num}
                    </Button>
                  ))}
                </div>

                {gameState.odds > 20 && (
                  <div className="flex items-center gap-2 justify-center">
                    <Label>Or enter a number:</Label>
                    <Input
                      type="number"
                      min="1"
                      max={gameState.odds}
                      value={selectedNumber || ''}
                      onChange={(e) => setSelectedNumber(parseInt(e.target.value) || null)}
                      className="w-20 text-center"
                    />
                  </div>
                )}

                <Button 
                  variant="default" 
                  size="lg"
                  className="w-full"
                  onClick={submitChallengerNumber}
                  disabled={selectedNumber === null}
                >
                  Lock in Number: {selectedNumber}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Pass Phone for Target Number */}
          {gameState.phase === 'pass-for-target-number' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">📱 Pass the Phone!</CardTitle>
                <CardDescription>
                  Give the phone to <strong>{gameState.target?.name}</strong> to pick their number
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-4 bg-game-bg rounded-lg border border-primary/20">
                  <h3 className="font-semibold mb-2">The Challenge:</h3>
                  <p className="text-foreground mb-2">{gameState.dare}</p>
                  <Badge variant="secondary">Odds: 1 in {gameState.odds}</Badge>
                  <div className="mt-2">
                    <Badge variant="outline">{gameState.challenger?.name} picked their number ✓</Badge>
                  </div>
                </div>
                <Button 
                  variant="dare" 
                  size="lg"
                  className="w-full"
                  onClick={() => setGameState(prev => ({ ...prev, phase: 'target-number' }))}
                >
                  I'm {gameState.target?.name} - Pick My Number
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Target Number Phase */}
          {gameState.phase === 'target-number' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle className="text-center">{gameState.target?.name}, Pick Your Number!</CardTitle>
                <CardDescription className="text-center">
                  Choose a number between 1 and {gameState.odds}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-5 gap-3 max-w-md mx-auto">
                  {generateNumberGrid(Math.min(gameState.odds, 20)).map((num) => (
                    <Button
                      key={num}
                      variant={selectedNumber === num ? "default" : "number"}
                      size="number"
                      onClick={() => setSelectedNumber(num)}
                      className="aspect-square"
                    >
                      {num}
                    </Button>
                  ))}
                </div>

                {gameState.odds > 20 && (
                  <div className="flex items-center gap-2 justify-center">
                    <Label>Or enter a number:</Label>
                    <Input
                      type="number"
                      min="1"
                      max={gameState.odds}
                      value={selectedNumber || ''}
                      onChange={(e) => setSelectedNumber(parseInt(e.target.value) || null)}
                      className="w-20 text-center"
                    />
                  </div>
                )}

                <Button 
                  variant="default" 
                  size="lg"
                  className="w-full"
                  onClick={submitTargetNumber}
                  disabled={selectedNumber === null}
                >
                  Lock in Number & Start Countdown!
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Final Countdown Phase */}
          {gameState.phase === 'final-countdown' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in text-center">
              <CardContent className="pt-8 pb-8">
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">📱 Put the phone on the table!</h2>
                  <p className="text-muted-foreground">
                    Both numbers are locked in. Revealing in...
                  </p>
                  <div className="text-8xl font-bold text-primary animate-bounce-in">
                    {gameState.countdownTimer}
                  </div>
                  <p className="text-lg">
                    If the numbers match, the dare happens!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Result Phase */}
          {gameState.phase === 'result' && (
            <Card className={`shadow-card animate-bounce-in ${isMatch ? 'bg-gradient-dare' : 'bg-gradient-card'}`}>
              <CardContent className="pt-8 pb-8 text-center">
                <div className="space-y-6">
                  <div className="text-6xl">
                    {isMatch ? '🎯' : '😅'}
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className={`text-3xl font-bold ${isMatch ? 'text-white' : 'text-foreground'}`}>
                      {isMatch ? 'IT\'S A MATCH!' : 'Safe This Time!'}
                    </h2>
                    <p className={`text-lg ${isMatch ? 'text-white/90' : 'text-muted-foreground'}`}>
                      {gameState.challenger?.name} picked {gameState.challengerNumber}, {gameState.target?.name} picked {gameState.targetNumber}
                    </p>
                  </div>

                  {isMatch && (
                    <div className={`p-4 rounded-lg bg-white/10 border border-white/20`}>
                      <h3 className="font-semibold mb-2 text-white">Time to do the dare:</h3>
                      <p className="text-white/90">{gameState.dare}</p>
                    </div>
                  )}

                  {isMatch && (
                    <Button 
                      variant="secondary"
                      size="sm"
                      className="mb-4"
                      onClick={() => addToLeaderboard(gameState.target?.name || 'Unknown', gameState.dare, gameState.odds)}
                    >
                      Add to Leaderboard
                    </Button>
                  )}

                  <Button 
                    variant={isMatch ? "secondary" : "party"}
                    size="lg"
                    className="w-full"
                    onClick={startNewRound}
                  >
                    Play Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leaderboard Phase */}
          {gameState.phase === 'leaderboard' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Leaderboard
                  </div>
                  {!adminMode && (
                    <Button variant="ghost" size="sm" onClick={() => setGameState(prev => ({ ...prev, phase: 'admin-login' }))}>
                      Admin
                    </Button>
                  )}
                  {adminMode && (
                    <Button variant="ghost" size="sm" onClick={() => setAdminMode(false)}>
                      Exit Admin
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Champions who completed their dares!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No completed dares yet. Be the first to win a challenge!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaderboard.map((entry, index) => (
                      <div key={index} className="p-3 bg-game-bg rounded-lg border border-primary/20">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="default" className="text-xs">
                                #{index + 1}
                              </Badge>
                              <span className="font-semibold">{entry.winner}</span>
                              <Badge variant="secondary" className="text-xs">
                                1 in {entry.odds}
                              </Badge>
                            </div>
                            <p className="text-sm text-foreground/80">{entry.dare}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {entry.timestamp.toLocaleDateString()} at {entry.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                          {adminMode && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => deleteLeaderboardEntry(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Button 
                    variant="ghost" 
                    size="lg"
                    className="w-full"
                    onClick={() => setGameState(prev => ({ ...prev, phase: 'setup' }))}
                  >
                    Back to Game
                  </Button>
                  
                  {adminMode && (
                    <Button 
                      variant="secondary" 
                      size="lg"
                      className="w-full"
                      onClick={() => setGameState(prev => ({ ...prev, phase: 'manage-dares' }))}
                    >
                      Manage Dares
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Admin Login Phase */}
          {gameState.phase === 'admin-login' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle>Admin Access</CardTitle>
                <CardDescription>
                  Enter admin credentials to manage dares and leaderboard
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="default"
                    onClick={adminLogin}
                    className="flex-1"
                  >
                    Login
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setGameState(prev => ({ ...prev, phase: 'leaderboard' }))}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manage Dares Phase */}
          {gameState.phase === 'manage-dares' && (
            <Card className="bg-gradient-card shadow-card animate-bounce-in">
              <CardHeader>
                <CardTitle>Manage Dares</CardTitle>
                <CardDescription>
                  Add new dares or remove existing ones
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Add New Dare</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newDare}
                      onChange={(e) => setNewDare(e.target.value)}
                      placeholder="Enter a new dare..."
                    />
                    <Button onClick={addNewDare} disabled={!newDare.trim()}>
                      Add
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  <Label>Current Dares ({predefinedDares.length})</Label>
                  {predefinedDares.map((dare, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-game-bg rounded border">
                      <span className="text-sm flex-1">{dare}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => deleteDare(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>

                <Button 
                  variant="ghost" 
                  size="lg"
                  className="w-full"
                  onClick={() => setGameState(prev => ({ ...prev, phase: 'leaderboard' }))}
                >
                  Back to Leaderboard
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRoom;