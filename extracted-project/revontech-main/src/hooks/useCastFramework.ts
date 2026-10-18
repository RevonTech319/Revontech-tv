import { useEffect, useState } from 'react';

declare global {
  interface Window {
    cast: any;
    chrome: any;
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}

const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

let sdkLoadPromise: Promise<boolean> | null = null;

function loadCastSdk(): Promise<boolean> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    // Already available (e.g., hot reload)
    if (window.cast?.framework) {
      resolve(true);
      return;
    }

    // Not supported (mobile Safari)
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    window.__onGCastApiAvailable = (available: boolean) => {
      if (!available) {
        resolve(false);
        return;
      }
      try {
        window.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId:
            window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        resolve(true);
      } catch (err) {
        console.warn('Cast SDK init failed:', err);
        resolve(false);
      }
    };

    const script = document.createElement('script');
    script.src = CAST_SDK_URL;
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);

    // Safety: if the callback never fires within 8s, treat as unavailable.
    setTimeout(() => resolve(false), 8000);
  });

  return sdkLoadPromise;
}

export interface CastFrameworkState {
  ready: boolean;
  available: boolean;
}

export function useCastFramework(): CastFrameworkState {
  const [state, setState] = useState<CastFrameworkState>({
    ready: false,
    available: false,
  });

  useEffect(() => {
    let mounted = true;
    loadCastSdk().then((ok) => {
      if (!mounted) return;
      setState({ ready: true, available: ok });
    });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
