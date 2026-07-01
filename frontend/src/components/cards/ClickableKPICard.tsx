import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string | number | null
  icon: LucideIcon
  accentColor: string
  onClick?: () => void
  secondary?: string
  large?: boolean
  statusDot?: 'green' | 'amber' | 'red'
  sparkline?: number[]
}

const STATUS_COLORS: Record<NonNullable<Props['statusDot']>, string> = {
  green: '#66BB6A',
  amber: '#FFA726',
  red: '#EF5350',
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data?.length) return null
  const w = 120
  const h = 26
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = w / (data.length - 1 || 1)
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="mt-2 opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ClickableKPICard({
  label,
  value,
  icon: Icon,
  accentColor,
  onClick,
  secondary,
  large,
  statusDot,
  sparkline,
}: Props) {
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-[#1e2528] rounded-[12px] transition-all duration-150 ${onClick ? 'cursor-pointer' : ''} ${large ? 'p-8' : 'p-5'}`}
      style={{
        boxShadow: '0 1px 3px rgba(9,29,65,0.06), 0 1px 2px rgba(9,29,65,0.04)',
      }}
      onMouseEnter={
        onClick
          ? (e) => {
              ;(e.currentTarget as HTMLElement).style.boxShadow =
                '0 4px 16px rgba(9,29,65,0.12), 0 2px 6px rgba(9,29,65,0.07)'
              ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (e) => {
              ;(e.currentTarget as HTMLElement).style.boxShadow =
                '0 1px 3px rgba(9,29,65,0.06), 0 1px 2px rgba(9,29,65,0.04)'
              ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {statusDot && (
              <span
                className={`inline-block w-2 h-2 rounded-full ${statusDot === 'red' ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: STATUS_COLORS[statusDot] }}
              />
            )}
            <p
              className={`font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] truncate ${large ? 'text-[11px]' : 'text-[10px]'}`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {label}
            </p>
          </div>
          <p
            className={`font-bold text-[#161c1f] dark:text-[#ecf2f6] leading-none ${large ? 'text-[3rem]' : 'text-[2rem]'}`}
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            {value ?? '—'}
          </p>
          {secondary && (
            <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] mt-2">{secondary}</p>
          )}
          {sparkline && <Sparkline data={sparkline} color={accentColor} />}
        </div>
        <div
          className={`flex-shrink-0 flex items-center justify-center rounded-[10px] ${large ? 'w-12 h-12' : 'w-10 h-10'}`}
          style={{ backgroundColor: accentColor + '1a' }}
        >
          <Icon size={large ? 22 : 18} style={{ color: accentColor }} strokeWidth={1.8} />
        </div>
      </div>
    </Wrapper>
  )
}
