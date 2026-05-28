import { supabase } from './supabase'

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  async signInDemo() {
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL || 'demo@flowtrack.app'
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || 'demo123456'
    return authService.signIn(demoEmail, demoPassword)
  },

  onAuthStateChange(callback: (session: unknown) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session)
    })
  },
}
