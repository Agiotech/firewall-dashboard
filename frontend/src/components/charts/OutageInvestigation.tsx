import { useEffect, useState, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { AlertOctagon, AlertTriangle, CheckCircle, Activity, Zap, Search } from 'lucide-react'

import { BaseChart } from './BaseChart'
import { api } from '../../api/client'
import { colors } from '../../theme/colors'

type Range = '1h' | '6h' | '24h' | '7d'

interface Issue {
  kind: string
  severity: 'high' | 'medium'
  from_ts: number
  to_ts: number
  duration_s?: number
  message: string
  target?: string
  wan?: string
}

interface Timeline {
  ts_from: number
  ts_to: number
  range_s: number
  wan_changes: { ts: number; wan_name: string; new_status: number }[]
  snmp_sample_count: number
  quality: { ts: number; target: string; latency_ms: number; loss_pct: number }[]
  connectivity_events: { ts: number; message: string }[]
  monitor_events: { ts: number; priority: string; message: string }[]
  issues: Issue[]
  issue_count_by_severity: { high: number; medium: number }
}

const SEVERITY_META = {
  high: { color: colors.chartRed, label: 'CRÍTICO', Icon: AlertOctagon },
  medium: { color: colors.chartAmber, label: 'WARN', Icon: AlertTriangle },
}

const KIND_LABELS: Record<string, string> = {
  snmp_gap: 'Gap SNMP',
  no_snmp: 'Sin SNMP',
  quality_gap: 'Gap de ping',
  high_loss: 'Pérdida alta',
  flapping: 'WAN flapeando',
  no_quality: 'Sin ping prober',
}

function fmtDuration(sec?: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('es-MX', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function OutageInvestigation() {
  const [range, setRange] = useState<Range>('6h')
  const [data, setData] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.diagnosticsTimeline(range).then((r) => {
      if (!cancelled) {
        setData(r as Timeline)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range])

  // Build a unified time-series chart: latency + loss per target, WAN status as background
  const chartOption: EChartsOption | null = useMemo(() => {
    if (!data) return null
    const targets = Array.from(new Set(data.quality.map((q) => q.target)))
    const series: any[] = []
    targets.forEach((t, i) => {
      const tColor = i === 0 ? colors.chartCyan : colors.chartTeal
      const points = data.quality.filter((q) => q.target === t)
      series.push({
        name: `Lat ${t}`,
        type: 'line',
        smooth: true,
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 2, color: tColor },
        data: points.map((p) => [p.ts * 1000, p.latency_ms || null]),
      })
      series.push({
        name: `Loss ${t}`,
        type: 'line',
        smooth: false,
        showSymbol: false,
        yAxisIndex: 1,
        lineStyle: { width: 1.5, color: tColor, type: 'dashed' },
        data: points.map((p) => [p.ts * 1000, p.loss_pct || 0]),
      })
    })

    // Mark areas for WAN DOWN periods (consecutive same-WAN pairs of changes 1→0 and 0→1)
    const downSpans: any[] = []
    const byWan: Record<string, { ts: number; status: number }[]> = {}
    data.wan_changes.forEach((c) => {
      byWan[c.wan_name] = byWan[c.wan_name] || []
      byWan[c.wan_name].push({ ts: c.ts, status: c.new_status })
    })
    Object.entries(byWan).forEach(([wan, evs]) => {
      let openTs: number | null = null
      evs.forEach((e) => {
        if (e.status === 0 && openTs === null) openTs = e.ts
        else if (e.status === 1 && openTs !== null) {
          downSpans.push([{
            xAxis: openTs * 1000, itemStyle: { color: colors.chartRed + '33' }, name: wan,
          }, { xAxis: e.ts * 1000 }])
          openTs = null
        }
      })
      if (openTs !== null) {
        downSpans.push([{ xAxis: openTs * 1000, itemStyle: { color: colors.chartRed + '33' }, name: wan }, { xAxis: data.ts_to * 1000 }])
      }
    })

    if (downSpans.length > 0 && series.length > 0) {
      series[0].markArea = { silent: true, data: downSpans }
    }

    // Highlight issue periods
    const issueMarks: any[] = data.issues.map((iss) => [
      { xAxis: iss.from_ts * 1000, itemStyle: { color: (iss.severity === 'high' ? colors.chartRed : colors.chartAmber) + '20' }, name: iss.kind },
      { xAxis: iss.to_ts * 1000 },
    ])
    if (issueMarks.length > 0 && series.length > 1) {
      series[1].markArea = { silent: true, data: issueMarks }
    }

    return {
      title: { text: 'Timeline combinado: latencia, pérdida y caídas WAN', left: 0, textStyle: { fontSize: 13 } },
      legend: { top: 0, right: 60, itemWidth: 10, itemHeight: 10 },
      grid: { top: 40, right: 16, bottom: 30, left: 50, containLabel: true },
      xAxis: { type: 'time' },
      yAxis: [
        { type: 'value', name: 'Lat ms', axisLabel: { fontSize: 9 }, min: 0 },
        { type: 'value', name: 'Loss %', max: 100, min: 0, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      tooltip: { trigger: 'axis' },
      series,
    }
  }, [data])

  const totalIssues = (data?.issue_count_by_severity?.high ?? 0) + (data?.issue_count_by_severity?.medium ?? 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[#4d5e85] dark:text-[#a8c4cc]" />
          <p
            className="text-[11px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Rango de investigación
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[#eef4f8] dark:bg-[#252c2f] rounded-[8px] p-0.5">
          {(['1h', '6h', '24h', '7d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase rounded-[6px] ${
                range === r ? 'bg-white dark:bg-[#1e2528] text-[#161c1f] dark:text-[#ecf2f6]' : 'text-[#4d5e85] dark:text-[#a8c4cc]'
              }`}
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={AlertOctagon}
          color={colors.chartRed}
          label="Problemas críticos"
          value={data?.issue_count_by_severity?.high ?? 0}
          sublabel="snmp gap / pérdida sostenida"
        />
        <StatCard
          icon={AlertTriangle}
          color={colors.chartAmber}
          label="Warnings"
          value={data?.issue_count_by_severity?.medium ?? 0}
          sublabel="gap de ping / flapping"
        />
        <StatCard
          icon={Zap}
          color={colors.chartCyan}
          label="Cambios de estado WAN"
          value={data?.wan_changes.length ?? 0}
          sublabel={`${data?.connectivity_events.length ?? 0} eventos Connectivity`}
        />
        <StatCard
          icon={Activity}
          color={colors.chartTeal}
          label="Muestras SNMP"
          value={data?.snmp_sample_count ?? 0}
          sublabel="poller del sistema"
        />
      </div>

      {/* Chart */}
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        {loading ? (
          <div className="h-[280px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
            Cargando…
          </div>
        ) : !chartOption || (data?.quality.length ?? 0) === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] text-center px-8">
            Sin muestras de ping prober en este rango. Verifica que QUALITY_CHECK_ENABLED=true.
          </div>
        ) : (
          <BaseChart option={chartOption} height={280} noZoom />
        )}
      </div>

      {/* Issues detected */}
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
        style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          {totalIssues === 0 ? (
            <CheckCircle size={14} style={{ color: colors.chartGreen }} />
          ) : (
            <AlertOctagon size={14} style={{ color: colors.chartRed }} />
          )}
          <p
            className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Problemas detectados ({totalIssues})
          </p>
        </div>

        {!data ? null : data.issues.length === 0 ? (
          <p className="text-[11px] text-[#4d5e85] dark:text-[#a8c4cc] py-4">
            ✓ No se detectaron gaps de datos ni pérdidas sostenidas en este rango. Si reportas caída, ocurrió en una ventana donde nuestros sensores tampoco la registraron — revisar Connectivity Check del USG y considerar bajar el umbral de WAN_DOWN.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.issues.map((iss, i) => {
              const meta = SEVERITY_META[iss.severity]
              const Icon = meta.Icon
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-[10px]"
                  style={{ backgroundColor: meta.color + '0d', border: `1px solid ${meta.color}22` }}
                >
                  <Icon size={14} style={{ color: meta.color }} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[9px] font-bold uppercase tracking-[0.10em] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: meta.color + '22', color: meta.color, fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {KIND_LABELS[iss.kind] ?? iss.kind}
                      </span>
                      <span
                        className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc]"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {fmtDateTime(iss.from_ts)} → {fmtDateTime(iss.to_ts)}  ·  {fmtDuration(iss.duration_s)}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#161c1f] dark:text-[#ecf2f6] mt-1">{iss.message}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Connectivity events feed */}
      {data && data.connectivity_events.length > 0 && (
        <div
          className="bg-white dark:bg-[#1e2528] rounded-[12px] p-5"
          style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
        >
          <p
            className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] mb-3"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Eventos Connectivity Check del USG ({data.connectivity_events.length})
          </p>
          <ul className="space-y-1 text-[11px] max-h-[200px] overflow-auto" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {data.connectivity_events.slice(0, 50).map((e, i) => {
              const isDead = (e.message || '').toUpperCase().includes('DEAD')
              return (
                <li key={i} className="flex gap-2">
                  <span className="text-[#4d5e85] dark:text-[#a8c4cc] flex-shrink-0">{fmtDateTime(e.ts)}</span>
                  <span style={{ color: isDead ? colors.chartRed : colors.chartGreen }}>
                    {e.message}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon, color, label, value, sublabel,
}: { icon: any; color: string; label: string; value: number; sublabel: string }) {
  return (
    <div
      className="bg-white dark:bg-[#1e2528] rounded-[12px] p-4"
      style={{ boxShadow: '0 1px 3px rgba(9,29,65,0.06)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {label}
        </p>
        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '1a' }}>
          <Icon size={14} style={{ color }} strokeWidth={1.8} />
        </div>
      </div>
      <p
        className="text-[1.75rem] font-bold leading-none text-[#161c1f] dark:text-[#ecf2f6]"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {value}
      </p>
      <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] mt-1">
        {sublabel}
      </p>
    </div>
  )
}
