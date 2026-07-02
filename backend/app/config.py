import json

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Firewall / SNMP
    firewall_host: str = "192.168.2.1"
    snmp_version: str = "v3"
    snmp_user: str = "monitor"
    snmp_auth_key: str = ""
    snmp_priv_key: str = ""
    snmp_auth_proto: str = "SHA"
    snmp_priv_proto: str = "AES"
    snmp_community: str = "public"
    snmp_port: int = 161
    snmp_timeout_s: int = 3
    snmp_retries: int = 2

    # Polling
    poll_interval_seconds: int = 30
    poll_interval_sfp_seconds: int = 300
    poll_interval_vpn_seconds: int = 60

    # Topology
    wan_interfaces: str = "wan1,wan2,wan3"
    lan_interfaces: str = "lan1,lan2,lan3,lan4"
    sfp_interfaces: str = "sfp1,sfp2"
    wan_labels: str = "{}"
    session_limit_per_host: int = 8000

    # Syslog
    syslog_bind_host: str = "0.0.0.0"
    syslog_bind_port: int = 5514
    syslog_min_severity: int = 5
    syslog_allowed_sources: str = "*"

    # NetFlow
    netflow_enabled: bool = False
    netflow_bind_host: str = "0.0.0.0"
    netflow_bind_port: int = 2055
    netflow_top_n: int = 50

    # Quality (active probes)
    quality_check_enabled: bool = True
    quality_check_targets: str = "1.1.1.1,8.8.8.8"
    quality_check_interval_s: int = 30
    quality_check_count: int = 10

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8088

    # Persistence
    db_path: str = "./data/dashboard.db"
    retention_days: int = 30

    # Mode
    mock_mode: bool = True
    log_level: str = "INFO"

    # Agio-Hub sync (store-and-forward, spec docs/specs/agio-hub-middleware.md)
    hub_sync_enabled: bool = False
    hub_url: str = ""
    # el seed del Hub escribe APP_TOKEN_FIREWALL_MONITOR_BATCH al .env
    # (contrato v0.2); HUB_APP_TOKEN queda como override explícito manual
    hub_app_token: str = Field(
        default="",
        validation_alias=AliasChoices("HUB_APP_TOKEN", "APP_TOKEN_FIREWALL_MONITOR_BATCH"),
    )
    hub_sync_interval_s: int = 60
    hub_sync_batch_size: int = 500
    hub_sync_timeout_s: int = 10
    hub_sync_max_backoff_s: int = 900

    # Alerts — common
    alert_eval_interval_s: int = 60

    # Alerts — webhook
    alert_webhook_enabled: bool = False
    alert_webhook_url: str = ""
    alert_webhook_min_severity: str = "HIGH"

    # Alerts — email (SMTP)
    alert_email_enabled: bool = False
    alert_email_smtp_host: str = ""
    alert_email_smtp_port: int = 587
    alert_email_smtp_user: str = ""
    alert_email_smtp_pass: str = ""
    alert_email_from: str = ""
    alert_email_to: str = ""
    alert_email_min_severity: str = "MEDIUM"

    # Thresholds
    fw_cpu_threshold: float = 80.0
    fw_mem_threshold: float = 85.0

    # Device discovery (LAN switches / APs / hosts via USG ARP table)
    device_scan_enabled: bool = True
    device_scan_interval_minutes: int = 30
    device_snmp_probe_enabled: bool = True
    device_snmp_community: str = "public"
    device_snmp_timeout_s: float = 1.5
    device_snmp_concurrency: int = 8
    device_max_per_scan: int = 200

    # Per-device traffic alert
    device_traffic_high_mbps: float = 50.0
    device_traffic_window_minutes: int = 5

    # Dashboard HTTP Basic Auth (set DASHBOARD_PASSWORD empty to disable)
    dashboard_username: str = "admin"
    dashboard_password: str = ""

    # VPN — map of site-to-site tunnel name -> remote LAN CIDR (e.g. "192.168.29.0/24").
    # Used to correlate flow_aggregates with each tunnel for "Tráfico por túnel".
    vpn_remote_subnets: str = "{}"

    # LAN — map of LAN port name (matching LAN_INTERFACES) -> local CIDR served by that port.
    # Used in the "click on a port" modal to filter top consumers by the host subnet of that VLAN.
    lan_port_subnets: str = "{}"

    @property
    def wan_list(self) -> list[str]:
        return [w.strip() for w in self.wan_interfaces.split(",") if w.strip()]

    @property
    def lan_list(self) -> list[str]:
        return [w.strip() for w in self.lan_interfaces.split(",") if w.strip()]

    @property
    def quality_targets_list(self) -> list[str]:
        return [t.strip() for t in self.quality_check_targets.split(",") if t.strip()]

    @property
    def wan_labels_map(self) -> dict[str, str]:
        try:
            return json.loads(self.wan_labels)
        except (json.JSONDecodeError, TypeError):
            return {}

    @property
    def vpn_remote_subnets_map(self) -> dict[str, str]:
        """Map tunnel_name -> CIDR string (e.g. '192.168.29.0/24')."""
        try:
            raw = json.loads(self.vpn_remote_subnets)
            return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, str)}
        except (json.JSONDecodeError, TypeError):
            return {}

    @property
    def lan_port_subnets_map(self) -> dict[str, str]:
        """Map LAN port_name -> local CIDR served by that port."""
        try:
            raw = json.loads(self.lan_port_subnets)
            return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, str)}
        except (json.JSONDecodeError, TypeError):
            return {}

    @property
    def syslog_allowed_set(self) -> set[str]:
        if self.syslog_allowed_sources.strip() == "*":
            return set()  # empty == allow all
        return {s.strip() for s in self.syslog_allowed_sources.split(",") if s.strip()}


settings = Settings()
