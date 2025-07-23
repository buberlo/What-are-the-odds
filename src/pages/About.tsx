import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Code, Gamepad2, Heart, Smartphone, Trophy, Users } from "lucide-react";

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-bg">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button variant="ghost" onClick={() => navigate('/')} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-party bg-clip-text text-transparent">
              About What Are The Odds?
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        
        {/* Game Overview */}
        <Card className="bg-gradient-card shadow-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Gamepad2 className="w-6 h-6 text-primary" />
              What Is "What Are The Odds?"
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg">
              "What Are The Odds?" is a popular party game that creates hilarious moments and unforgettable memories. 
              It's all about dares, luck, and the thrill of chance!
            </p>
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-primary">The Basic Concept:</h4>
              <p>
                One player dares another to do something silly, embarrassing, or fun. The target sets odds 
                (like "1 in 10"), and if both players say the same number in that range, the dare must be completed!
              </p>
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card className="bg-gradient-card shadow-card border-secondary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-secondary" />
              Game Mechanics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-primary/10 rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Step 1: The Dare</h4>
                  <p className="text-sm">Player A challenges Player B with a dare. Could be anything from "sing your favorite song" to "text your ex"!</p>
                </div>
                <div className="bg-secondary/10 rounded-lg p-4">
                  <h4 className="font-semibold text-secondary mb-2">Step 2: Set the Odds</h4>
                  <p className="text-sm">Player B chooses odds like "1 in 5" or "1 in 20" - higher odds mean less chance of doing the dare.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-accent/10 rounded-lg p-4">
                  <h4 className="font-semibold text-accent mb-2">Step 3: The Countdown</h4>
                  <p className="text-sm">Both players simultaneously say a number between 1 and the chosen range after a 10-second countdown.</p>
                </div>
                <div className="bg-dare-accent/10 rounded-lg p-4">
                  <h4 className="font-semibold text-dare-accent mb-2">Step 4: Match = Dare!</h4>
                  <p className="text-sm">If both players say the same number, Player B must complete the dare! If different, they're safe.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="bg-gradient-card shadow-card border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-accent" />
              App Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <Smartphone className="w-8 h-8 text-primary mx-auto" />
                <h4 className="font-semibold">Pass the Phone</h4>
                <p className="text-sm text-muted-foreground">Perfect for local gatherings. One device, endless fun!</p>
              </div>
              <div className="text-center space-y-2">
                <Users className="w-8 h-8 text-secondary mx-auto" />
                <h4 className="font-semibold">Multiplayer Ready</h4>
                <p className="text-sm text-muted-foreground">Create rooms and play with friends online!</p>
              </div>
              <div className="text-center space-y-2">
                <Trophy className="w-8 h-8 text-accent mx-auto" />
                <h4 className="font-semibold">Leaderboard</h4>
                <p className="text-sm text-muted-foreground">Track winners and their completed dares!</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card className="bg-gradient-card shadow-card border-dare-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Code className="w-6 h-6 text-dare-accent" />
              Technical Implementation
            </CardTitle>
            <CardDescription>How this app is built</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-primary">Frontend Technologies</h4>
                <ul className="space-y-2 text-sm">
                  <li>• <strong>React 18</strong> - Modern component-based UI</li>
                  <li>• <strong>TypeScript</strong> - Type-safe development</li>
                  <li>• <strong>Tailwind CSS</strong> - Utility-first styling</li>
                  <li>• <strong>Vite</strong> - Lightning-fast build tool</li>
                  <li>• <strong>Radix UI</strong> - Accessible components</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3 text-secondary">Key Features</h4>
                <ul className="space-y-2 text-sm">
                  <li>• <strong>Local Storage</strong> - Persistent leaderboard</li>
                  <li>• <strong>Responsive Design</strong> - Works on all devices</li>
                  <li>• <strong>Admin Panel</strong> - Manage dares and leaderboard</li>
                  <li>• <strong>Random Suggestions</strong> - Built-in dare ideas</li>
                  <li>• <strong>Toast Notifications</strong> - User feedback</li>
                </ul>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-accent">Architecture Highlights</h4>
              <p className="text-sm">
                Built with modern web standards using React Router for navigation, custom hooks for state management, 
                and a responsive design system. The app uses local storage for persistence and is optimized for both 
                mobile and desktop experiences.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Fun Facts */}
        <Card className="bg-gradient-card shadow-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Heart className="w-6 h-6 text-primary" />
              Why This Game Is Special
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-primary/10 rounded-lg p-4">
                <h4 className="font-semibold text-primary mb-2">Builds Connections</h4>
                <p className="text-sm">Creates shared memories and breaks the ice at parties and gatherings.</p>
              </div>
              <div className="bg-secondary/10 rounded-lg p-4">
                <h4 className="font-semibold text-secondary mb-2">Pure Chance</h4>
                <p className="text-sm">No skill required - it's all about luck and the thrill of the unknown!</p>
              </div>
              <div className="bg-accent/10 rounded-lg p-4">
                <h4 className="font-semibold text-accent mb-2">Endless Variety</h4>
                <p className="text-sm">Every dare is different, making each game unique and unpredictable.</p>
              </div>
              <div className="bg-dare-accent/10 rounded-lg p-4">
                <h4 className="font-semibold text-dare-accent mb-2">Social Fun</h4>
                <p className="text-sm">Best played with friends - the more people, the more entertaining!</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default About;