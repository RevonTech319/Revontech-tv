import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Mail, Lock, ShieldAlert } from 'lucide-react';

export default function AdminLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: err } = await signIn(email, password);

    if (!err) {
      navigate('/');
    } else {
      setError(err.message || 'Barua pepe au nywila si sahihi');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center glow-primary overflow-hidden">
              <img src="/logo.jpg" alt="RT" className="w-full h-full object-cover" />
            </div>
            <p className="text-2xl font-black tracking-widest text-primary uppercase">REVONTECH</p>
          </div>
          <p className="text-muted-foreground text-xs flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Admin Panel — Restricted Access
          </p>
        </div>

        <div className="cyber-card rounded-xl p-6 border border-border">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-foreground text-sm font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Barua Pepe (Email)
              </Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@revontech.com"
                className="bg-muted border-border text-foreground"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-pwd" className="text-foreground text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" /> Nywila (Password)
              </Label>
              <div className="relative">
                <Input
                  id="admin-pwd"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Weka nywila"
                  className="bg-muted border-border text-foreground pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm p-3 rounded-lg bg-destructive/20 text-destructive border border-destructive/30">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/80 font-bold tracking-wider"
            >
              {loading ? '...' : 'INGIA KAMA ADMIN'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
