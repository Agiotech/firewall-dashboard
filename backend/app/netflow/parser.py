"""Minimal NetFlow v9 parser (RFC 3954).

Stateful: caller passes/receives the `templates` dict to persist between packets.
Only fields needed for top-host accounting are decoded; others are skipped.
"""
import socket
import struct
from dataclasses import dataclass

V9_VERSION = 9

# Field types we care about (NetFlow v9 field type ids)
F_IN_BYTES = 1
F_IN_PKTS = 2
F_PROTOCOL = 4
F_L4_SRC_PORT = 7
F_IPV4_SRC_ADDR = 8
F_INPUT_SNMP = 10
F_L4_DST_PORT = 11
F_IPV4_DST_ADDR = 12
F_OUTPUT_SNMP = 14
F_DIRECTION = 61
F_OUT_BYTES = 23
F_OUT_PKTS = 24


@dataclass
class Flow:
    src_ip: str = ""
    dst_ip: str = ""
    src_port: int = 0
    dst_port: int = 0
    protocol: int = 0
    bytes_: int = 0
    packets: int = 0
    in_iface: int = 0
    out_iface: int = 0
    direction: int = -1


class ParseError(Exception):
    pass


def _read_uint(buf: bytes, length: int) -> int:
    if length == 1:
        return buf[0]
    if length == 2:
        return struct.unpack_from(">H", buf)[0]
    if length == 4:
        return struct.unpack_from(">I", buf)[0]
    if length == 8:
        return struct.unpack_from(">Q", buf)[0]
    return int.from_bytes(buf[:length], "big")


def _read_ip(buf: bytes, length: int) -> str:
    if length == 4:
        return socket.inet_ntoa(buf[:4])
    if length == 16:
        return socket.inet_ntop(socket.AF_INET6, buf[:16])
    return ""


def parse_v9(data: bytes, templates: dict[int, list[tuple[int, int]]]) -> list[Flow]:
    """Parse a single NetFlow v9 packet.

    `templates` keyed by template_id, value is list of (field_type, field_length).
    Mutated in place when new templates are observed.
    Returns list of decoded Flow records.
    """
    if len(data) < 20:
        raise ParseError("packet too short")
    version, count = struct.unpack_from(">HH", data, 0)
    if version != V9_VERSION:
        raise ParseError(f"not v9 (got v{version})")

    offset = 20
    flows: list[Flow] = []
    flowset_index = 0
    while offset + 4 <= len(data) and flowset_index < count:
        flowset_id, length = struct.unpack_from(">HH", data, offset)
        if length < 4 or offset + length > len(data):
            break
        body = data[offset + 4 : offset + length]
        if flowset_id == 0:
            # Template flowset (may contain multiple templates)
            i = 0
            while i + 4 <= len(body):
                tmpl_id, field_count = struct.unpack_from(">HH", body, i)
                i += 4
                fields: list[tuple[int, int]] = []
                for _ in range(field_count):
                    if i + 4 > len(body):
                        break
                    ft, fl = struct.unpack_from(">HH", body, i)
                    fields.append((ft, fl))
                    i += 4
                templates[tmpl_id] = fields
        elif flowset_id == 1:
            # Options template — skip (we don't use options data)
            pass
        elif flowset_id >= 256:
            tmpl = templates.get(flowset_id)
            if tmpl is None:
                pass  # unknown template, skip until we see it
            else:
                rec_size = sum(fl for _, fl in tmpl)
                if rec_size == 0:
                    pass
                else:
                    pos = 0
                    while pos + rec_size <= len(body):
                        flow = Flow()
                        fp = pos
                        for ft, fl in tmpl:
                            sub = body[fp : fp + fl]
                            if ft == F_IPV4_SRC_ADDR:
                                flow.src_ip = _read_ip(sub, fl)
                            elif ft == F_IPV4_DST_ADDR:
                                flow.dst_ip = _read_ip(sub, fl)
                            elif ft == F_L4_SRC_PORT:
                                flow.src_port = _read_uint(sub, fl)
                            elif ft == F_L4_DST_PORT:
                                flow.dst_port = _read_uint(sub, fl)
                            elif ft == F_PROTOCOL:
                                flow.protocol = _read_uint(sub, fl)
                            elif ft in (F_IN_BYTES, F_OUT_BYTES):
                                flow.bytes_ += _read_uint(sub, fl)
                            elif ft in (F_IN_PKTS, F_OUT_PKTS):
                                flow.packets += _read_uint(sub, fl)
                            elif ft == F_INPUT_SNMP:
                                flow.in_iface = _read_uint(sub, fl)
                            elif ft == F_OUTPUT_SNMP:
                                flow.out_iface = _read_uint(sub, fl)
                            elif ft == F_DIRECTION:
                                flow.direction = _read_uint(sub, fl)
                            fp += fl
                        if flow.src_ip and flow.dst_ip:
                            flows.append(flow)
                        pos += rec_size
        offset += length
        flowset_index += 1
    return flows
