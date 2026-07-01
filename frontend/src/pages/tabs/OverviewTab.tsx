import { Globe, Cpu, MemoryStick, AlertOctagon } from 'lucide-react'

import { SectionTitle } from '../../components/layout/SectionTitle'
import { ClickableKPICard } from '../../components/cards/ClickableKPICard'
import { WANTrafficChart } from '../../components/charts/WANTrafficChart'
import { LatencyPercentilesChart } from '../../components/charts/LatencyPercentilesChart'
import { SystemMetricsChart } from '../../components/charts/SystemMetricsChart'
import { colors } from '../../theme/colors'
import { formatBps, formatPct, formatNumber, formatUptime, formatBytes } from '../../utils/format'
import type { HealthResponse, WanCard, ActiveAlert } from '../../types'

const WAN_COLORS = [colors.chartBlue, colors.chartCyan, colors.chartIndigo]

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: colors.chartRed,
  HIGH: colors.chartRed,
  MEDIUM: colors.chartAmber,
  LOW: colors.chartCyan,
}

function statusFromWan(w: WanCard): 'green' | 'amber' | 'red' {
  if (w.oper_status === 0) return 'red'
  if (w.loss_pct > 5 || w.latency_ms > 100) return 'amber'
  const util = Math.max(w.bps_in, w.bps_out) / (w.link_speed_mbps * 1_000_000)
  if (util > 0.85) return 'amber'
  return 'green'
}

interface Props {
  data: HealthResponse | null
  alerts: ActiveAlert[]
}

export function OverviewTab({ data, alerts }: Props) {
  const wanLabels: Record<string, string> = {}
  data?.wans.forEach((w) => { wanLabels[w.name] = w.label })
  const wanNames = data?.wans.map((w) => w.name) ?? []

  return (
    <div className="space-y-10">
      {alerts.length > 0 && (
        <section>
          <SectionTitle>{`Alertas activas (${alerts.length})`}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alerts.map((a) => {
              const color = SEVERITY_COLORS[a.severity] ?? colors.chartAmber
              const duration = Math.floor((Date.now() / 1000 - a.started_at) / 60)
              const hasPeers = (a.peers ?? []).length > 0
              return (
                <div
                  key={`${a.rule_id}:${a.subject}`}
                  className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5 flex items-start gap-3"
                  style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
                >
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: color + '1a' }}
                  >
                    <AlertOctagon size={18} style={{ color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.10em] mb-1"
                      style={{ color, fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {a.severity} · {a.rule_id}
                    </p>
                    <p
                      className="text-[16px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      {a.subject}
                    </p>
                    {hasPeers && (
                      <div className="mt-2 pt-2 border-t border-[#e9eff3] dark:border-[#252c2f]">
                        <p
                          className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-1"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                        >
                          Top peers que generan el tráfico
                        </p>
                        <ul className="space-y-1">
                          {(a.peers ?? []).slice(0, 5).map((p) => (
                            <li key={p.ip} className="text-[11px] flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-[#161c1f] dark:text-[#ecf2f6] truncate"
                                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                                >
                                  {p.ip}
                                  {p.hostname && (
                                    <span
                                      className="ml-2 text-[#4d5e85] dark:text-[#a8c4cc]"
                                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                                    >
                                      · {p.hostname}
                                    </span>
                                  )}
                                </p>
                                {p.description && (
                                  <p
                                    className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] truncate"
                                    style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                                  >
                                    {p.description}
                                  </p>
                                )}
                              </div>
                              <span
                                className="flex-shrink-0 font-bold"
                                style={{ color, fontFamily: 'JetBrains Mono, monospace' }}
                              >
                                {formatBytes(p.total_bytes)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] mt-2">
                      Hace {duration} min
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Global Health</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {data?.wans.map((w, i) => (
            <ClickableKPICard
              key={w.name}
              label={w.label}
              value={w.oper_status === 0 ? 'DOWN' : formatBps(w.bps_in)}
              secondary={
                w.oper_status === 0
                  ? 'Sin conexión'
                  : `↑${formatBps(w.bps_out)}  ·  ${w.latency_ms.toFixed(0)}ms  ·  ${formatPct(w.loss_pct, 1)} loss`
              }
              icon={Globe}
              accentColor={WAN_COLORS[i % WAN_COLORS.length]}
              statusDot={statusFromWan(w)}
              sparkline={w.sparkline}
            />
          ))}
          {data && (
            <ClickableKPICard
              label="CPU"
              value={`${data.system.cpu_pct.toFixed(0)}%`}
              secondary={`Sesiones ${formatNumber(data.system.sessions_total)}`}
              icon={Cpu}
              accentColor={colors.chartTeal}
              sparkline={data.system.sparkline_cpu}
            />
          )}
          {data && (
            <ClickableKPICard
              label="Memoria"
              value={`${data.system.mem_pct.toFixed(0)}%`}
              secondary={`Uptime ${formatUptime(data.system.uptime_sec)}`}
              icon={MemoryStick}
              accentColor={colors.chartIndigo}
            />
          )}
        </div>
      </section>

      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="wan-traffic">Tráfico WAN (última hora)</SectionTitle>
          <WANTrafficChart wans={wanNames} labels={wanLabels} range="1h" />
        </section>
      )}

      <section>
        <SectionTitle helpKey="system-metrics">Salud del firewall</SectionTitle>
        <SystemMetricsChart range="1h" />
      </section>

      <section>
        <SectionTitle helpKey="latency-percentiles">Calidad de internet</SectionTitle>
        <LatencyPercentilesChart range="1h" />
      </section>
    </div>
  )
}
