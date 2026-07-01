"""Test DHCP CSV parser against the user's real export."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.dhcp import parse_csv

CSV_PATH = Path(r"C:\Users\francisco.mendez\Downloads\dhcp-table-2026_05_27.csv")


def main() -> None:
    text = CSV_PATH.read_text(encoding="utf-8-sig", errors="replace")
    records = parse_csv(text)
    print(f"Parseados: {len(records)} registros\n")
    print("Primeros 5:")
    for r in records[:5]:
        print(f"  ip={r.get('ip')}  mac={r.get('mac')}  host={r.get('hostname')!r}  desc={r.get('description')!r}  vlan={r.get('vlan')!r}  if={r.get('interface')!r}")
    print("\nUltimos 3:")
    for r in records[-3:]:
        print(f"  ip={r.get('ip')}  mac={r.get('mac')}  host={r.get('hostname')!r}  desc={r.get('description')!r}")

    # Check the one in the screenshot (192.168.1.86 IT142Rolando)
    target = next((r for r in records if r.get("ip") == "192.168.1.86"), None)
    if target:
        print(f"\nTarget 192.168.1.86: {target}")
    else:
        print(f"\nNo se encontro 192.168.1.86 en el CSV (probablemente esta en otro export)")


if __name__ == "__main__":
    main()
