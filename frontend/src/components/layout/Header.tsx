import { RefreshCw, Moon, Sun, Shield, FileSpreadsheet } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { SyslogStatusBadge } from '../common/SyslogStatusBadge'

interface Props {
  lastUpdate: Date | null
  onRefresh: () => void
  loading: boolean
  mockMode: boolean
  onImportDhcp?: () => void
}

export function Header({ lastUpdate, onRefresh, loading, mockMode, onImportDhcp }: Props) {
  const isDark = useThemeStore((s) => s.isDark)
  const toggleTheme = useThemeStore((s) => s.toggle)

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#1e2528]/90 backdrop-blur-md border-b border-[#e9eff3] dark:border-[#252c2f]"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.04)' }}
    >
      <div className="max-w-[1600px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center"
            style={{ backgroundColor: '#00687614' }}
          >
            <Shield size={20} style={{ color: '#006876' }} strokeWidth={1.8} />
          </div>
          <div>
            <p
              className="text-[16px] font-bold text-[#161c1f] dark:text-[#ecf2f6] leading-none"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Firewall Dashboard
            </p>
            <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1 uppercase tracking-[0.08em]">
              USG Flex 700H
            </p>
          </div>
          {mockMode && (
            <span
              className="ml-3 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] rounded-md"
              style={{ backgroundColor: '#FFA72622', color: '#FFA726', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Mock
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <SyslogStatusBadge />
          {lastUpdate && (
            <span
              className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] uppercase tracking-[0.06em]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Última act. {lastUpdate.toLocaleTimeString('es-MX')}
            </span>
          )}
          {onImportDhcp && (
            <button
              onClick={onImportDhcp}
              className="rounded-full p-2 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f] transition-colors"
              title="Importar reservas DHCP del firewall"
            >
              <FileSpreadsheet size={16} />
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full p-2 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f] transition-colors disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f] transition-colors"
            title={isDark ? 'Tema claro' : 'Tema oscuro'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  )
}
