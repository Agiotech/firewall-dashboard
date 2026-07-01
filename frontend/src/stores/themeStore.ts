import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggle: () => void
  set: (isDark: boolean) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggle: () =>
        set((s) => {
          const next = !s.isDark
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', next)
          }
          return { isDark: next }
        }),
      set: (isDark) => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', isDark)
        }
        set({ isDark })
      },
    }),
    {
      name: 'fwdash-theme',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', state.isDark)
        }
      },
    },
  ),
)
