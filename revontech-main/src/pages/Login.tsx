import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Phone, User, Lock, Sparkles } from 'lucide-react';

type Mode = 'login' | 'signup';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref') || '';

  // Auto-switch to signup when arriving via a referral link
  const [mode, setMode] = useState<Mode>(refParam ? 'signup' : 'login');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // If URL has ?ref= switch to signup silently
  useEffect(() => {
    if (refParam) setMode('signup');
  }, [refParam]);

  const phoneToEmail = (p: string) => {
    let cleaned = p.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '255' + cleaned.slice(1);
    if (!cleaned.startsWith('255')) cleaned = '255' + cleaned;
    return `user${cleaned}@chtv.app`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      setError('Please enter a valid phone number');
      setLoading(false);
      return;
    }

    const internalEmail = phoneToEmail(phone);

    if (mode === 'login') {
      const { error: err } = await signIn(internalEmail, password);
      if (err) {
        setError('Incorrect phone number or password');
      } else {
        navigate('/');
      }
    } else {
      if (!displayName.trim()) {
        setError('Name is required');
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }
      // Pass referral code silently from URL — no visible field
      const { error: err } = await signUp(internalEmail, password, displayName, cleanPhone, refParam || undefined);
      if (err) {
        const msg = err.message || '';
        if (msg.includes('already-in-use') || msg.includes('already') || msg.includes('EMAIL_EXISTS')) {
          setError('Namba hii tayari imesajiliwa. Ingia badala yake.');
        } else if (msg.includes('weak-password')) {
          setError('Nenosiri ni dhaifu sana. Tumia angalau herufi 6.');
        } else if (msg.includes('ADMIN_ONLY_OPERATION')) {
          setError('Usajili umezimwa. Wasiliana na msaada.');
        } else {
          setError(msg || 'Kuna tatizo. Jaribu tena.');
          console.error('Signup error:', msg, '| email:', internalEmail);
        }
      } else {
        setSuccess('Account created! Please log in.');
        setMode('login');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center glow-primary overflow-hidden">
              <img src="/logo.jpg" alt="RT" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-2xl font-black tracking-widest text-primary text-glow-primary uppercase">REVONTECH</p>
              <p className="text-sm font-bold tracking-[0.3em] text-secondary uppercase -mt-1">TV</p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">Your Premium Streaming Platform</p>
        </div>

        {/* Referral welcome banner — only shows when arriving via referral link */}
        {refParam && (
          <div className="mb-5 flex items-start gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-primary">Umealikwa na rafiki!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Jisajili sasa — rafiki wako atapata zawadi ukijiunga nawe.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1">
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
                mode === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="cyber-card rounded-xl p-6 border border-border">
          <form onSubmit={handleSubmit} className="space-y-4">

            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-primary" /> Your Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Full name"
                  className="bg-muted border-border text-foreground"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-primary" /> Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+255 712 345 678"
                className="bg-muted border-border text-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-primary" /> Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                  className="bg-muted border-border text-foreground pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
            {success && (
              <p className="text-sm p-3 rounded-lg bg-green-900/30 text-green-400 border border-green-700">
                {success}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/80 font-bold tracking-wider glow-cyan"
            >
              {loading ? '...' : mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
