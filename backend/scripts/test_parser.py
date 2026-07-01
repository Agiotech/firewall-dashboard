"""Test the syslog parser against real log samples."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.syslog.parsers import parse_zyxel

SAMPLES = [
    # Traffic log with bytes
    '<142>May 22 17:24:03 2026 usgflex700h src="192.168.0.61:53090" dst="160.79.104.10:443" msg="Traffic Log" note="" user="admin" devID="f44d5c94f517" cat="Traffic Log" action="" sourceTranslatedAddress=192.168.68.101 sourceTranslatedPort=53090 suser=admin sent=930790 rcvd=35808 dir=P5-Phones:P2-Telmex2 protoID=6 proto=https mac=04:0e:3c:ed:36:2a',
    # Security Policy drop
    '<142>May 22 17:24:04 2026 usgflex700h src="0.0.0.0:68" dst="255.255.255.255:67" msg="Match default rule DROP" note="ACCESS BLOCK" user="" devID="f44d5c94f517" cat="Security Policy Control" action="Drop"',
    # External attack (telnet scan)
    '<142>May 22 17:24:08 2026 usgflex700h src="157.230.49.33:11031" dst="193.149.142.45:23" msg="Match default rule DROP" note="ACCESS BLOCK" user="" devID="f44d5c94f517" cat="Security Policy Control" action="Drop"',
    # SCADA scan
    '<142>May 22 17:24:06 2026 usgflex700h src="205.210.31.212:57226" dst="193.149.142.45:502" msg="Match default rule DROP" note="ACCESS BLOCK" user="" devID="f44d5c94f517" cat="Security Policy Control" action="Drop"',
    # IPSec VPN
    '<142>May 22 17:24:05 2026 usgflex700h src="189.172.193.74:4500" dst="193.149.142.45:4500" msg="VPN-GDL-SES-BUENAVISTA sending DPD response" note="" user="" devID="f44d5c94f517" cat="IPSec VPN" action=""',
]

for i, line in enumerate(SAMPLES, 1):
    e = parse_zyxel(line)
    print(f"\n=== sample {i} ===")
    if not e:
        print("  FAILED TO PARSE")
        continue
    print(f"  cat       = {e.category}")
    print(f"  priority  = {e.priority_name}")
    print(f"  src       = {e.src_ip}:{e.src_port}")
    print(f"  dst       = {e.dst_ip}:{e.dst_port}")
    print(f"  sent/rcvd = {e.sent_bytes} / {e.rcvd_bytes} bytes")
    print(f"  proto     = {e.proto}")
    print(f"  dir       = {e.dir_}")
    print(f"  mac       = {e.mac}")
    print(f"  action    = {e.action}")
    print(f"  note      = {e.note}")
    print(f"  user      = {e.user}")
    print(f"  msg       = {(e.message or '')[:80]}")
