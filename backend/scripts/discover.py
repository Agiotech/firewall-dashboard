"""Discover what the firewall exposes via SNMP.

Tests various OID branches to understand the MIB layout of this firmware.
Run after `validate.py` to see why interface discovery may have failed.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.snmp.client import SnmpReadError, snmp_get, snmp_walk


GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}[OK]{RESET}    {msg}")


def fail(msg: str) -> None:
    print(f"{RED}[FAIL]{RESET}  {msg}")


def info(msg: str) -> None:
    print(f"{YELLOW}[INFO]{RESET}  {msg}")


GETS = [
    ("sysDescr", "1.3.6.1.2.1.1.1.0"),
    ("sysObjectID", "1.3.6.1.2.1.1.2.0"),
    ("sysName", "1.3.6.1.2.1.1.5.0"),
    ("sysUpTime", "1.3.6.1.2.1.1.3.0"),
    ("sysContact", "1.3.6.1.2.1.1.4.0"),
    ("sysLocation", "1.3.6.1.2.1.1.6.0"),
    ("ifNumber.0", "1.3.6.1.2.1.2.1.0"),
]

WALKS = [
    ("system", "1.3.6.1.2.1.1"),
    ("ifTable", "1.3.6.1.2.1.2.2.1"),
    ("ifDescr", "1.3.6.1.2.1.2.2.1.2"),
    ("ifName (ifXTable)", "1.3.6.1.2.1.31.1.1.1.1"),
    ("ifAlias (ifXTable)", "1.3.6.1.2.1.31.1.1.1.18"),
    ("ipAddrTable", "1.3.6.1.2.1.4.20.1"),
]


async def main() -> None:
    print(f"\n=== Single OID gets (GET) ===")
    for name, oid in GETS:
        try:
            r = await snmp_get([oid])
            v = list(r.values())[0] if r else "?"
            ok(f"{name:30s} = {v}")
        except SnmpReadError as e:
            fail(f"{name:30s} → {e}")

    for name, base in WALKS:
        print(f"\n=== Walk {name} ({base}) ===")
        try:
            out = await snmp_walk(base, max_iters=20)
        except SnmpReadError as e:
            fail(f"walk failed: {e}")
            continue
        if not out:
            info(f"empty result")
            continue
        ok(f"{len(out)} OIDs encontrados")
        # Print all entries for interface-related walks; truncate big tables
        limit = len(out) if base in ("1.3.6.1.2.1.2.2.1.2", "1.3.6.1.2.1.31.1.1.1.1") else 25
        for k, v in list(out.items())[:limit]:
            print(f"    {k:50s} = {v}")
        if len(out) > limit:
            print(f"    ... ({len(out) - limit} mas)")


if __name__ == "__main__":
    asyncio.run(main())
