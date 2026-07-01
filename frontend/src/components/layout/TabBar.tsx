import type { LucideIcon } from 'lucide-react'

import { colors } from '../../theme/colors'

export interface TabDef {
  id: string
  label: string
  Icon: LucideIcon
  badge?: number | null
  badgeColor?: string
}

interface Props {
  current: string
  tabs: TabDef[]
  onChange: (id: string) => void
}

export function TabBar({ current, tabs, onChange }: Props) {
  return (
    <nav
      className="sticky top-[72px] z-30 bg-[#f4fafe]/95 dark:bg-[#2b3134]/95 backdrop-blur-md border-b border-[#e9eff3] dark:border-[#252c2f]"
    >
      <div className="max-w-[1600px] mx-auto px-8 flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.Icon
          const active = current === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-all border-b-2 ${
                active
                  ? 'text-[#161c1f] dark:text-[#ecf2f6]'
                  : 'text-[#4d5e85] dark:text-[#a8c4cc] border-transparent hover:text-[#161c1f] dark:hover:text-[#ecf2f6]'
              }`}
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                borderBottomColor: active ? colors.primary : 'transparent',
              }}
            >
              <Icon size={14} strokeWidth={2} />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                  style={{
                    backgroundColor: (t.badgeColor ?? colors.chartRed) + '22',
                    color: t.badgeColor ?? colors.chartRed,
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
