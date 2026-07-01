import type {
  AlertsResponse,
  EventRow,
  EventsResponse,
  HealthResponse,
  StatusResponse,
  WanMetricsResponse,
} from '../types'

const API_BASE = ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => get<HealthResponse>('/api/health'),
  status: () => get<StatusResponse>('/api/status'),

  wanMetrics: (name: string, range: string) =>
    get<WanMetricsResponse>(`/api/wan/${encodeURIComponent(name)}/metrics?range=${range}`),

  wanAvailability: (name: string, days: number) =>
    get<{
      data: { day_ts: number; uptime_pct: number; down_seconds: number; samples: number }[]
      days: number
      meta: { wan: string; label: string }
    }>(`/api/wan/${encodeURIComponent(name)}/availability?days=${days}`),

  wanDowntime: (name: string, range: string) =>
    get<{
      data: {
        start_ts: number
        end_ts: number
        duration_s: number
        ongoing: boolean
        inferred_recovery: boolean
      }[]
      meta: { wan: string }
    }>(`/api/wan/${encodeURIComponent(name)}/downtime?range=${range}`),

  qualitySeries: (target: string | undefined, range: string) => {
    const p = new URLSearchParams({ range })
    if (target) p.set('target', target)
    return get<{ data: { ts: number; target: string; latency_ms: number; jitter_ms: number; loss_pct: number }[]; targets: string[] }>(
      `/api/quality/series?${p.toString()}`,
    )
  },

  qualityPercentiles: (target: string, range: string) =>
    get<{ target: string; samples: number; p50: number; p90: number; p99: number; avg: number; loss_avg: number; jitter_avg: number; range_s: number }>(
      `/api/quality/percentiles?target=${encodeURIComponent(target)}&range=${range}`,
    ),

  events: (priority?: string, category?: string, limit = 100, offset = 0) => {
    const p = new URLSearchParams()
    if (priority) p.set('priority', priority)
    if (category) p.set('category', category)
    p.set('limit', String(limit))
    p.set('offset', String(offset))
    return get<EventsResponse>(`/api/events?${p.toString()}`)
  },

  topTalkers: (range: string, limit = 10) =>
    get<{
      top_src: { src_ip: string; n: number }[]
      top_dst: { dst_ip: string; n: number }[]
      top_dst_port: { dst_port: number; n: number }[]
      range_s: number
    }>(`/api/events/top-talkers?range=${range}&limit=${limit}`),

  activeAlerts: () => get<AlertsResponse>('/api/alerts/active'),

  lanPorts: () =>
    get<{
      data: {
        port_name: string
        oper_status: number
        bps_in: number
        bps_out: number
        errors_in: number
        errors_out: number
        speed_mbps: number
      }[]
      ts: number
    }>('/api/lan/ports'),

  systemSeries: (range: string) =>
    get<{
      data: { ts: number; cpu_pct: number | null; mem_pct: number | null; sessions: number | null }[]
      ts_from: number
      ts_to: number
      resolution_s: number
    }>(`/api/system/series?range=${range}`),

  heatmapWanSaturation: (wan: string, range: string) =>
    get<{
      data: { dow: number; hour: number; bps_avg: number; bps_max: number; samples: number }[]
      range_s: number
    }>(`/api/heatmaps/wan-saturation?wan=${encodeURIComponent(wan)}&range=${range}`),

  heatmapWanConsumption: (wan: string, range: string) =>
    get<{
      data: { dow: number; hour: number; bytes_in: number; bytes_out: number; bytes_total: number; samples: number }[]
      range_s: number
      poll_interval_s: number
    }>(`/api/heatmaps/wan-consumption?wan=${encodeURIComponent(wan)}&range=${range}`),

  heatmapEvents: (range: string) =>
    get<{ data: { dow: number; hour: number; n: number }[]; range_s: number }>(
      `/api/heatmaps/events-hour-day?range=${range}`,
    ),

  eventsSeveritySeries: (range: string) =>
    get<{
      data: { bucket_ts: number; priority: string; n: number }[]
      bucket_s: number
      range_s: number
    }>(`/api/events/severity-series?range=${range}`),

  topLanHosts: (direction: 'download' | 'upload', range: string, limit = 20) =>
    get<{
      data: { host: string; total_bytes: number; total_packets: number }[]
      direction: string
      range_s: number
      ts: number
    }>(`/api/flows/top-lan-hosts?direction=${direction}&range=${range}&limit=${limit}`),

  topExternalIps: (direction: 'download' | 'upload', range: string, limit = 20) =>
    get<{
      data: { host: string; total_bytes: number; total_packets: number }[]
      direction: string
      range_s: number
      ts: number
    }>(`/api/flows/top-external-ips?direction=${direction}&range=${range}&limit=${limit}`),

  flowTotals: (range: string) =>
    get<{
      data: { flows: number; bytes_: number; packets: number }
      range_s: number
    }>(`/api/flows/totals?range=${range}`),

  devices: (type?: string, limit = 500) => {
    const p = new URLSearchParams()
    if (type) p.set('type', type)
    p.set('limit', String(limit))
    return get<{
      data: {
        ip: string
        mac: string | null
        vendor: string | null
        hostname: string | null
        sys_descr: string | null
        device_type: string | null
        snmp_ok: number
        first_seen: number
        last_seen: number
        if_index_fw: number | null
      }[]
      summary: { total: number; by_type: Record<string, number>; snmp_ok: number }
      ts: number
    }>(`/api/devices?${p.toString()}`)
  },

  devicesInventory: (range: string) =>
    get<{
      data: {
        type: string
        type_label: string
        name: string
        ip: string
        mac: string
        bytes_in: number
        bytes_out: number
        bytes_total: number
      }[]
      summary: { total: number; by_type: Record<string, number> }
      range_s: number
      ts: number
    }>(`/api/devices/inventory?range=${range}`),

  devicesTrafficTop: (range: string, limit = 20) =>
    get<{
      data: {
        ip: string
        mac: string | null
        vendor: string | null
        hostname: string | null
        device_type: string | null
        bytes_in: number
        bytes_out: number
        bytes_total: number
      }[]
      range_s: number
    }>(`/api/devices/traffic-top?range=${range}&limit=${limit}`),

  deviceTraffic: (ip: string, range: string) =>
    get<{
      data: { ts: number; bytes_in: number; bytes_out: number; bps_in: number; bps_out: number }[]
      range_s: number
      bucket_s: number
    }>(`/api/devices/${encodeURIComponent(ip)}/traffic?range=${range}`),

  deviceMetrics: (ip: string, range: string) =>
    get<{ data: { ts: number; cpu_pct: number | null; mem_pct: number | null; uptime_sec: number | null }[] }>(
      `/api/devices/${encodeURIComponent(ip)}/metrics?range=${range}`,
    ),

  triggerDeviceScan: async () => {
    const res = await fetch('/api/devices/scan', { method: 'POST' })
    if (!res.ok) throw new Error('scan failed')
    return res.json()
  },

  dhcpList: (q?: string) =>
    get<{
      data: {
        ip: string
        mac: string | null
        hostname: string | null
        description: string | null
        vlan: string | null
        interface: string | null
        status: string | null
        source: string
        updated_at: number
      }[]
      count: number
    }>(`/api/dhcp${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  dhcpStats: () => get<{ count: number; ts: number }>('/api/dhcp/_/stats'),

  vpnTunnels: (state?: string) =>
    get<{
      data: {
        name: string
        peer_ip: string | null
        local_ip: string | null
        state: string | null
        last_event_msg: string | null
        last_event_ts: number | null
        last_dpd_ts: number | null
        dpd_count: number
        rekeys: number
        first_seen: number
        last_seen: number
        age_sec: number
        health: 'healthy' | 'stale' | 'down' | 'unknown'
      }[]
      summary: { total: number; up: number; stale: number; down: number; unknown: number }
    }>(`/api/vpn/tunnels${state ? `?state=${state}` : ''}`),

  vpnClients: (activeOnly = false, limit = 200) =>
    get<{
      data: {
        id: number
        username: string | null
        src_ip: string | null
        assigned_ip: string | null
        vpn_type: string | null
        started_at: number
        ended_at: number | null
        last_seen_ts: number
        duration_sec: number
        active: boolean
      }[]
      summary: { active: number; last_24h: number }
    }>(`/api/vpn/clients?active_only=${activeOnly}&limit=${limit}`),

  vpnEvents: (limit = 100) =>
    get<{
      data: {
        id: number
        ts: number
        priority: string
        message: string
        src_ip: string | null
        dst_ip: string | null
      }[]
    }>(`/api/vpn/events?limit=${limit}`),

  dhcpImport: async (csvText: string, source = 'manual') => {
    const res = await fetch(`/api/dhcp/import?source=${encodeURIComponent(source)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvText,
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(detail || `HTTP ${res.status}`)
    }
    return res.json() as Promise<{ imported: number; received: number; source: string }>
  },

  geoExternal: (range: string, top = 30) =>
    get<{
      points: { ip: string; bytes: number; country: string | null; country_code: string | null; city: string | null; lat: number; lon: number; isp: string | null }[]
      countries: { country_code: string; country: string | null; bytes: number; ip_count: number; lat: number | null; lon: number | null }[]
      range_s: number
    }>(`/api/geo/external?range=${range}&top=${top}`),

  geoBranches: () =>
    get<{
      data: { name: string; peer_ip: string | null; state: string | null; country: string | null; city: string | null; lat: number | null; lon: number | null; isp: string | null; health: string }[]
    }>('/api/geo/branches'),

  securityAttacks: (range: string, limit = 50) =>
    get<{
      data: {
        src_ip: string; attempts: number; distinct_ports: number; first_seen: number; last_seen: number; score: number
        top_ports: { dst_port: number; n: number }[]
        country: string | null; country_code: string | null; city: string | null; isp: string | null
        category: 'attack' | 'scan' | 'service' | 'noise'
        category_reason: string
      }[]
      timeline: { bucket_ts: number; attempts: number; distinct_attackers: number }[]
      summary: { attack: number; scan: number; service: number; noise: number }
    }>(`/api/security/attacks?range=${range}&limit=${limit}`),

  deviceDetail: (ip: string, range: string) =>
    get<{
      device: any
      traffic: { ts: number; bytes_in: number; bytes_out: number; bps_in: number; bps_out: number }[]
      top_destinations: {
        top_dst: { peer: string; bytes_out: number }[]
        top_src: { peer: string; bytes_in: number }[]
        top_ports: { dst_port: number; n: number }[]
      }
      events: any[]
      metrics: { ts: number; cpu_pct: number | null; mem_pct: number | null }[]
    }>(`/api/devices/${encodeURIComponent(ip)}/detail?range=${range}`),

  newDevices: (days = 7, limit = 100) =>
    get<{ data: any[]; days: number }>(`/api/devices/_/new?days=${days}&limit=${limit}`),

  vendorDistribution: () =>
    get<{ data: { vendor: string; n: number }[] }>('/api/devices/_/vendors'),

  lanErrorsHeatmap: (range: string) =>
    get<{
      ports: string[]
      buckets: number[]
      data: {
        port_name: string
        bucket_ts: number
        errs: number
        errs_in_avg: number
        errs_out_avg: number
        errs_in_max: number
        errs_out_max: number
        samples: number
      }[]
      bucket_s: number
    }>(`/api/lan/errors-heatmap?range=${range}`),

  lanPortTopHosts: (port: string, range: string, limit = 20) =>
    get<{
      download: { host: string; total_bytes: number; total_packets: number }[]
      upload: { host: string; total_bytes: number; total_packets: number }[]
      configured: boolean
      cidr: string | null
      port: string
      range_s: number
      ts: number
      suggested_subnets: { cidr: string; bytes: number; hosts: number }[]
    }>(`/api/lan/ports/${encodeURIComponent(port)}/top-hosts?range=${range}&limit=${limit}`),

  lanErrorsDetail: (port: string, range: string) =>
    get<{
      data: { ts: number; errors_in: number; errors_out: number; oper_status: number; bps_in: number; bps_out: number }[]
      meta: { port: string }
    }>(`/api/lan/ports/${encodeURIComponent(port)}/errors-detail?range=${range}`),

  vpnUptime: (range: string) =>
    get<{
      data: { tunnel: string; uptime_pct: number; alive_buckets: number; total_buckets: number; samples: number; state: string | null; peer_ip: string | null; last_dpd_ts: number | null }[]
    }>(`/api/vpn/uptime?range=${range}`),

  vpnDailyHeatmap: (range: string) =>
    get<{
      data: { tunnel: string; day_ts: number; bytes_total: number }[]
      tunnels: { name: string; bytes_total: number }[]
      days: number[]
      configured_count: number
      range_s: number
      ts: number
    }>(`/api/vpn/daily-heatmap?range=${range}`),

  vpnUsageHeatmap: (tunnel: string, range: string) =>
    get<{
      data: { dow: number; hour: number; bytes_total: number; samples: number }[]
      configured: boolean
      remote_subnet: string | null
      tunnel?: string
      range_s: number
    }>(`/api/vpn/usage-heatmap?tunnel=${encodeURIComponent(tunnel)}&range=${range}`),

  vpnTraffic: (range: string) =>
    get<{
      data: {
        tunnel: string
        peer_ip: string | null
        remote_subnet: string | null
        configured: boolean
        bytes_in: number
        bytes_out: number
        bytes_total: number
        state: string | null
      }[]
    }>(`/api/vpn/traffic?range=${range}`),

  anomalyWan: (name: string, range: string, weeks = 4) =>
    get<{
      data: { ts: number; actual: number; p5: number; median: number; p95: number; samples: number }[]
      weeks: number
    }>(`/api/anomaly/wan/${encodeURIComponent(name)}?range=${range}&weeks=${weeks}`),

  hardwareLatest: () =>
    get<{ data: { ts: number; kind: string; name: string; value: number; unit: string | null }[] }>(
      '/api/hardware/latest',
    ),

  syslogStatus: () =>
    get<{
      state: 'stopped' | 'binding' | 'running' | 'degraded' | 'bind_failed'
      bound_addr: string | null
      bound_at: number | null
      last_packet_ts: number | null
      last_parsed_ts: number | null
      packets_total: number
      packets_filtered_acl: number
      packets_parsed: number
      parse_failures: number
      bind_attempts: number
      last_error: string | null
      transport_alive: boolean
      last_packet_age_s: number | null
      bound_age_s: number | null
    }>('/api/system/syslog-status'),

  diagnosticsTimeline: (range: string) =>
    get<{
      ts_from: number
      ts_to: number
      range_s: number
      wan_changes: { ts: number; wan_name: string; new_status: number }[]
      snmp_sample_count: number
      quality: { ts: number; target: string; latency_ms: number; loss_pct: number }[]
      connectivity_events: { ts: number; message: string; src_ip: string | null; dst_ip: string | null }[]
      monitor_events: { ts: number; priority: string; message: string }[]
      events_per_min: { bucket_ts: number; category: string; n: number }[]
      issues: {
        kind: string
        severity: 'high' | 'medium'
        from_ts: number
        to_ts: number
        duration_s?: number
        message: string
        target?: string
        wan?: string
        samples?: number
        changes?: number
      }[]
      issue_count_by_severity: { high: number; medium: number }
    }>(`/api/diagnostics/timeline?range=${range}`),
}

export type { EventRow }
