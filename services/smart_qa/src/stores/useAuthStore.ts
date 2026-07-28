import { create } from "zustand";

type AuthState = {
  session: SessionData | null;
  hasHydrated: boolean;
  setSession: (session: SessionData | null) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  hasHydrated: false,
  setSession: (session) => set({ session, hasHydrated: true }),
  clearUser: () => set({ session: null, hasHydrated: true }),
}));
