export interface WanCard {
  name: string
  label: string
  oper_status: number
  bps_in: number
  bps_out: number
  latency_ms: number
  loss_pct: number
  link_speed_mbps: number
  sparkline: number[]
}

export interface SystemCard {
  cpu_pct: number
  mem_pct: number
  sessions_total: number
  uptime_sec: number
  sparkline_cpu: number[]
  sparkline_sessions: number[]
}

export interface HealthResponse {
  mock_mode: boolean
  wans: WanCard[]
  system: SystemCard
  alerts_count: number
}

export interface StatusResponse {
  mock_mode: boolean
  firewall_host: string
  now_ts: number
  version: string
}

export interface WanMetricPoint {
  ts: number
  oper_status: number
  bps_in: number
  bps_out: number
}

export interface WanMetricsResponse {
  data: WanMetricPoint[]
  ts_from: number
  ts_to: number
  resolution_s: number
  meta: { wan: string; label: string }
}

export interface EventRow {
  id: number
  ts: number
  priority: string
  category: string
  message: string
  src_ip: string | null
  src_port: number | null
  dst_ip: string | null
  dst_port: number | null
  action: string | null
  note: string | null
}

export interface EventsResponse {
  data: EventRow[]
  total: number
  limit: number
  offset: number
  ts: number
}

export interface AlertPeer {
  ip: string
  total_bytes: number
  total_packets: number
  hostname?: string | null
  description?: string | null
  mac?: string | null
}

export interface ActiveAlert {
  rule_id: string
  severity: string
  subject: string
  started_at: number
  peers?: AlertPeer[]
  mbps?: number
  is_private?: boolean
}

export interface AlertsResponse {
  data: ActiveAlert[]
}
