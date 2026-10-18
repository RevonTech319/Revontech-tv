import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function TopLoader() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const location = useLocation();

  useEffect(() => {
    setLoading(true);
    setProgress(30);
    
    const timer = setTimeout(() => {
      setProgress(100);
      const doneTimer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(doneTimer);
    }, 500);

    return () => clearTimeout(timer);
  }, [location]);

  if (!loading && progress === 0) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent"
    >
      <div 
        className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
