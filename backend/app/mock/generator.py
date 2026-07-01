import math
import random
import time
from dataclasses import dataclass


@dataclass
class WanSnapshot:
    name: str
    label: str
    oper_status: int
    bps_in: float
    bps_out: float
    latency_ms: float
    loss_pct: float
    link_speed_mbps: int


@dataclass
class SystemSnapshot:
    cpu_pct: float
    mem_pct: float
    sessions_total: int
    uptime_sec: int


def _sine(t: float, period_s: float, amplitude: float, offset: float) -> float:
    return offset + amplitude * math.sin(2 * math.pi * (t % period_s) / period_s)


def _mock_wan(name: str, label: str, base_mbps: float, t: float) -> WanSnapshot:
    # WAN3 simula caída cada 5 min durante 30s
    is_down = name == "wan3" and (int(t) % 300) < 30
    bps_in = 0 if is_down else max(0, _sine(t, 600, base_mbps * 0.3, base_mbps) + random.uniform(-5, 5)) * 1_000_000
    bps_out = 0 if is_down else max(0, _sine(t, 600, base_mbps * 0.05, base_mbps * 0.15) + random.uniform(-1, 1)) * 1_000_000
    latency = 999 if is_down else max(5, _sine(t, 60, 5, 18) + random.uniform(-2, 2))
    loss = 100 if is_down else max(0, random.uniform(-0.5, 0.8))
    return WanSnapshot(
        name=name,
        label=label,
        oper_status=0 if is_down else 1,
        bps_in=bps_in,
        bps_out=bps_out,
        latency_ms=latency,
        loss_pct=loss,
        link_speed_mbps=1000,
    )


def mock_wans() -> list[WanSnapshot]:
    t = time.time()
    return [
        _mock_wan("wan1", "Telmex Principal", 80, t),
        _mock_wan("wan2", "Telmex Secundario", 340, t),
        _mock_wan("wan3", "Backup", 50, t),
    ]


def mock_system() -> SystemSnapshot:
    t = time.time()
    return SystemSnapshot(
        cpu_pct=max(5, _sine(t, 120, 8, 12) + random.uniform(-2, 2)),
        mem_pct=max(20, _sine(t, 600, 5, 41) + random.uniform(-1, 1)),
        sessions_total=int(_sine(t, 300, 800, 4321) + random.uniform(-100, 100)),
        uptime_sec=int(t - 1_700_000_000),
    )


@dataclass
class LanSnapshot:
    name: str
    oper_status: int
    bps_in: float
    bps_out: float
    errors_in: float
    errors_out: float
    speed_mbps: int


def mock_lan_ports(names: list[str]) -> list[LanSnapshot]:
    t = time.time()
    out: list[LanSnapshot] = []
    for i, n in enumerate(names):
        is_down = i == 3 and (int(t) % 600) > 540
        base = (i + 1) * 8
        bps_in = 0 if is_down else max(0, _sine(t, 180, base * 0.4, base) + random.uniform(-1, 1)) * 1_000_000
        bps_out = 0 if is_down else max(0, _sine(t, 240, base * 0.1, base * 0.3) + random.uniform(-0.3, 0.3)) * 1_000_000
        out.append(LanSnapshot(
            name=n,
            oper_status=0 if is_down else 1,
            bps_in=bps_in,
            bps_out=bps_out,
            errors_in=max(0, random.gauss(0, 0.3)),
            errors_out=max(0, random.gauss(0, 0.1)),
            speed_mbps=1000 if i < 4 else 100,
        ))
    return out


_MOCK_LAN_HOSTS = [
    "192.168.3.114", "192.168.5.235", "192.168.20.9", "192.168.5.159",
    "192.168.20.85", "192.168.20.38", "192.168.20.39", "192.168.1.10",
    "192.168.5.14", "192.168.5.40", "192.168.5.12", "192.168.20.7",
    "192.168.5.88", "192.168.3.200", "192.168.3.201", "192.168.20.55",
    "192.168.5.99", "192.168.3.105", "192.168.5.45", "192.168.20.12",
    "192.168.3.50", "192.168.5.150", "192.168.5.220", "192.168.20.41",
]
_MOCK_EXTERNAL_IPS = [
    "8.8.8.8", "1.1.1.1", "142.251.46.78", "23.46.52.28", "40.99.247.18",
    "52.96.47.82", "104.18.39.21", "151.101.66.49", "172.64.146.152",
    "3.161.25.128", "44.215.141.185", "104.225.143.43", "192.178.139.94",
    "35.80.189.188", "184.30.236.30", "20.42.73.28", "52.157.7.183",
    "18.97.36.14", "54.176.233.58", "142.251.154.119", "131.253.33.200",
    "131.253.34.150", "204.79.197.200", "65.55.252.10", "13.107.42.14",
]


def mock_flow_rows(ts_bucket: int) -> list[tuple[int, str, str, int, int]]:
    """Generate ~40 mock flow aggregates for a given minute bucket.

    Heavy-tailed: a few hosts dominate the top.
    """
    rows: list[tuple[int, str, str, int, int]] = []
    # Heavy hosts (top 5) get most of the bytes
    for i, host in enumerate(_MOCK_LAN_HOSTS[:5]):
        for _ in range(2):
            ext = random.choice(_MOCK_EXTERNAL_IPS)
            # Download dominant for these
            dl_bytes = int((1_000_000 / (i + 1)) * random.uniform(0.7, 1.3))
            ul_bytes = int(dl_bytes * random.uniform(0.05, 0.2))
            rows.append((ts_bucket, ext, host, dl_bytes, max(1, dl_bytes // 1500)))
            rows.append((ts_bucket, host, ext, ul_bytes, max(1, ul_bytes // 1500)))
    # Long tail
    for host in _MOCK_LAN_HOSTS[5:]:
        if random.random() < 0.6:
            ext = random.choice(_MOCK_EXTERNAL_IPS)
            dl_bytes = int(random.uniform(20_000, 250_000))
            ul_bytes = int(dl_bytes * random.uniform(0.05, 0.5))
            rows.append((ts_bucket, ext, host, dl_bytes, max(1, dl_bytes // 1500)))
            rows.append((ts_bucket, host, ext, ul_bytes, max(1, ul_bytes // 1500)))
    return rows


def mock_sparkline(points: int = 30, base: float = 50, amp: float = 20) -> list[float]:
    t = time.time()
    step = 60
    out = []
    for i in range(points, 0, -1):
        ts = t - i * step
        out.append(max(0, _sine(ts, 600, amp, base) + random.uniform(-amp * 0.1, amp * 0.1)))
    return out
