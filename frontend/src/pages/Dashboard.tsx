import { useEffect, useState, useCallback } from 'react'
import {
  Home, Globe, Network, Shield, TrendingUp, ShieldAlert, AlertTriangle,
} from 'lucide-react'

import { Header } from '../components/layout/Header'
import { TabBar, type TabDef } from '../components/layout/TabBar'
import { DhcpImport } from '../components/common/DhcpImport'
import { OverviewTab } from './tabs/OverviewTab'
import { WanTab } from './tabs/WanTab'
import { LanTab } from './tabs/LanTab'
import { VpnTab } from './tabs/VpnTab'
import { TrafficTab } from './tabs/TrafficTab'
import { SecurityTab } from './tabs/SecurityTab'
import { api } from '../api/client'
import { colors } from '../theme/colors'
import type { HealthResponse, ActiveAlert } from '../types'

const TAB_IDS = ['overview', 'wan', 'lan', 'vpn', 'traffic', 'security'] as const
type TabId = (typeof TAB_IDS)[number]

function readHashTab(): TabId {
  const h = (typeof window !== 'undefined' ? window.location.hash.slice(1) : '') as TabId
  return TAB_IDS.includes(h) ? h : 'overview'
}

export function Dashboard() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dhcpOpen, setDhcpOpen] = useState(false)
  const [tab, setTab] = useState<TabId>(readHashTab)

  useEffect(() => {
    const handler = () => setTab(readHashTab())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const goTab = useCallback((id: string) => {
    if (TAB_IDS.includes(id as TabId)) {
      window.location.hash = id
      setTab(id as TabId)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [resp, alertsResp] = await Promise.all([api.health(), api.activeAlerts()])
      setData(resp)
      setAlerts(alertsResp.data)
      setLastUpdate(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const wanLabels: Record<string, string> = {}
  data?.wans.forEach((w) => { wanLabels[w.name] = w.label })
  const wanNames = data?.wans.map((w) => w.name) ?? []

  const tabs: TabDef[] = [
    {
      id: 'overview',
      label: 'Resumen',
      Icon: Home,
      badge: alerts.length || null,
      badgeColor: colors.chartRed,
    },
    { id: 'wan', label: 'WAN', Icon: Globe },
    { id: 'lan', label: 'LAN / Dispositivos', Icon: Network },
    { id: 'vpn', label: 'VPN', Icon: Shield },
    { id: 'traffic', label: 'Tráfico', Icon: TrendingUp },
    { id: 'security', label: 'Seguridad', Icon: ShieldAlert },
  ]

  return (
    <div className="min-h-screen pt-[72px] bg-[#f4fafe] dark:bg-[#2b3134]">
      <Header
        lastUpdate={lastUpdate}
        onRefresh={load}
        loading={loading}
        mockMode={data?.mock_mode ?? true}
        onImportDhcp={() => setDhcpOpen(true)}
      />
      <DhcpImport open={dhcpOpen} onClose={() => setDhcpOpen(false)} />
      <TabBar current={tab} tabs={tabs} onChange={goTab} />

      <main className="max-w-[1600px] mx-auto px-8 pt-6 pb-12">
        {error && (
          <div
            className="mb-6 bg-white dark:bg-[#1e2528] rounded-[12px] p-5 border border-[#EF5350]"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} style={{ color: colors.chartRed }} />
              <p className="text-[13px] font-bold text-[#161c1f] dark:text-[#ecf2f6]">
                Error al cargar datos: {error}
              </p>
            </div>
          </div>
        )}

        {/* Mini banner de alertas en tabs que no son overview */}
        {alerts.length > 0 && tab !== 'overview' && (
          <button
            onClick={() => goTab('overview')}
            className="w-full mb-6 bg-white dark:bg-[#1e2528] rounded-[12px] p-3 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
            style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)', borderLeft: `4px solid ${colors.chartRed}` }}
          >
            <ShieldAlert size={18} style={{ color: colors.chartRed }} strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p
                className="text-[12px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} activa{alerts.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] truncate">
                {alerts.slice(0, 3).map((a) => `${a.severity} · ${a.subject}`).join('   |   ')}
                {alerts.length > 3 && '   |   ...'}
              </p>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded flex-shrink-0"
              style={{ color: colors.chartRed, backgroundColor: colors.chartRed + '1a', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Ver en Resumen →
            </span>
          </button>
        )}

        {!data && !error && tab === 'overview' && (
          <p className="text-center text-[12px] text-[#4d5e85] dark:text-[#a8c4cc] py-12">
            Cargando…
          </p>
        )}

        {tab === 'overview' && <OverviewTab data={data} alerts={alerts} />}
        {tab === 'wan' && <WanTab wanNames={wanNames} wanLabels={wanLabels} />}
        {tab === 'lan' && <LanTab />}
        {tab === 'vpn' && <VpnTab />}
        {tab === 'traffic' && <TrafficTab />}
        {tab === 'security' && <SecurityTab />}
      </main>
    </div>
  )
}
