"""Validar conexion con el firewall y puertos abiertos del dashboard.

Uso (desde backend/ con venv activo):
    python scripts/validate.py
"""
import asyncio
import socket
import sys
from pathlib import Path

# Permitir importar app/ cuando se invoca desde backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.snmp import oids
from app.snmp.client import SnmpReadError, snmp_get, snmp_walk


GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}[OK]{RESET}    {msg}")


def fail(msg: str) -> None:
    print(f"{RED}[FAIL]{RESET}  {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{RESET}  {msg}")


async def check_snmp() -> bool:
    print(f"\n=== SNMP a {settings.firewall_host}:{settings.snmp_port} (v{settings.snmp_version}, user '{settings.snmp_user}') ===")
    try:
        r = await snmp_get([oids.SYS_NAME, oids.SYS_UPTIME])
    except SnmpReadError as e:
        fail(f"SNMP GET fallo: {e}")
        return False
    except Exception as e:
        fail(f"Excepcion SNMP: {e}")
        return False
    sysname = r.get(oids.SYS_NAME, "?")
    uptime_ticks = int(r.get(oids.SYS_UPTIME, 0))
    days = uptime_ticks // 100 // 86400
    ok(f"sysName = {sysname}  | uptime ~{days} dias")
    return True


async def check_interfaces() -> None:
    print(f"\n=== Descubrimiento de interfaces (ifDescr walk) ===")
    try:
        descr = await snmp_walk(oids.IF_DESCR)
    except SnmpReadError as e:
        fail(f"Walk fallo: {e}")
        return

    by_name = {}
    for oid_str, name in descr.items():
        try:
            idx = int(oid_str.rsplit(".", 1)[-1])
            by_name[str(name).lower()] = (idx, str(name))
        except ValueError:
            continue

    ok(f"{len(by_name)} interfaces descubiertas")
    for cfg_name in settings.wan_list:
        if cfg_name.lower() in by_name:
            idx, real = by_name[cfg_name.lower()]
            ok(f"  WAN config '{cfg_name}' -> ifIndex {idx} ({real})")
        else:
            fail(f"  WAN config '{cfg_name}' NO existe en el firewall")
    for cfg_name in settings.lan_list:
        if cfg_name.lower() in by_name:
            idx, real = by_name[cfg_name.lower()]
            ok(f"  LAN config '{cfg_name}' -> ifIndex {idx} ({real})")
        else:
            warn(f"  LAN config '{cfg_name}' no existe (puede ser normal)")

    if any(c.lower() not in by_name for c in settings.wan_list):
        print(f"\n{YELLOW}    Nombres disponibles en el firewall:{RESET}")
        for n in sorted(by_name):
            print(f"      - {n}")


def check_local_port(port: int, name: str) -> None:
    print(f"\n=== Puerto local UDP {port} ({name}) ===")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.bind(("0.0.0.0", port))
        s.close()
        ok(f"Puerto UDP {port} libre. Cuando arranque el server lo va a tomar.")
    except OSError as e:
        if e.errno in (10048, 98):
            warn(f"Puerto UDP {port} ya esta en uso (puede ser el server corriendo).")
        else:
            fail(f"No se pudo abrir UDP {port}: {e}")


async def main() -> int:
    print(f"Validacion de conectividad — Firewall Dashboard")
    print(f"Modo: {'MOCK' if settings.mock_mode else 'REAL'}")

    if settings.mock_mode:
        warn("MOCK_MODE=true → SNMP no se va a usar realmente. Cambia .env si quieres validar contra el firewall.")
        return 0

    snmp_ok = await check_snmp()
    if snmp_ok:
        await check_interfaces()

    check_local_port(settings.syslog_bind_port, "Syslog")
    if getattr(settings, "netflow_enabled", False):
        check_local_port(settings.netflow_bind_port, "NetFlow")
    else:
        print(f"\n=== NetFlow: deshabilitado (NETFLOW_ENABLED=false) ===")

    print("\nListo.")
    return 0 if snmp_ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
