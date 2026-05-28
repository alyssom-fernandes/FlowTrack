import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  isLoading: boolean
  isDemo: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setDemo: (isDemo: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isDemo: false,

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setDemo: (isDemo) => set({ isDemo }),
  clear: () => set({ user: null, isDemo: false, isLoading: false }),
}))
