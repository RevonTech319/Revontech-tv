import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs,
  increment, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/** Generate a short alphanumeric referral code from a uid */
function generateReferralCode(uid: string): string {
  return uid.slice(-8).toUpperCase();
}

/**
 * Called right after a new user signs up with a referral code.
 * - Only increments referrer's referral_count by 1
 * - NO rewards given until the referred user buys a package
 */
async function creditReferrerOnSignup(referralCode: string) {
  try {
    if (!db) return;

    const refQ = query(collection(db, 'profiles'), where('referral_code', '==', referralCode));
    const refSnap = await getDocs(refQ);
    if (refSnap.empty) return;

    const referrerDoc = refSnap.docs[0];
    const referrerUid = referrerDoc.id;

    // Only increment the referral count, no rewards yet
    await updateDoc(doc(db, 'profiles', referrerUid), { referral_count: increment(1) });
  } catch (err) {
    console.error('Error crediting referrer on signup:', err);
  }
}

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  phone: string | null;
  referral_code?: string;
  referred_by?: string | null;
  referral_count?: number;
  reward_claimed?: number;
  pending_commissions?: number; // Track commissions waiting to be paid
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
    referredBy?: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    if (!db) return;
    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data() as Profile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        fetchProfile(firebaseUser.uid);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) return { error: new Error('Firebase setup is incomplete.') };
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      return { error: error as Error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
    referredBy?: string
  ) => {
    if (!auth || !db) return { error: new Error('Firebase setup is incomplete.') };
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const referralCode = generateReferralCode(user.uid);

      // Validate the referral code if provided
      let validReferredBy: string | null = null;
      if (referredBy?.trim()) {
        const code = referredBy.trim().toUpperCase();
        const refQ = query(collection(db, 'profiles'), where('referral_code', '==', code));
        const refSnap = await getDocs(refQ);
        if (!refSnap.empty) validReferredBy = code;
      }

      const newProfile = {
        id: user.uid,
        user_id: user.uid,
        display_name: displayName,
        avatar_url: null,
        plan: 'Free',
        phone: phone || null,
        referral_code: referralCode,
        referred_by: validReferredBy,
        referral_count: 0,
        reward_claimed: 0,
        pending_commissions: 0,
      };

      await setDoc(doc(db, 'profiles', user.uid), newProfile);
      setProfile(newProfile);

      if (validReferredBy) {
        await creditReferrerOnSignup(validReferredBy).catch(console.error);
      }

      return { error: null };
    } catch (error: any) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
