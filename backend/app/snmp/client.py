import logging
from typing import Any

from pysnmp.hlapi.asyncio import (
    CommunityData,
    ContextData,
    ObjectIdentity,
    ObjectType,
    SnmpEngine,
    UdpTransportTarget,
    UsmUserData,
    bulkCmd,
    getCmd,
    usmAesCfb128Protocol,
    usmDESPrivProtocol,
    usmHMACMD5AuthProtocol,
    usmHMACSHAAuthProtocol,
)

from ..config import settings

log = logging.getLogger(__name__)


AUTH_PROTOS = {"SHA": usmHMACSHAAuthProtocol, "MD5": usmHMACMD5AuthProtocol}
PRIV_PROTOS = {"AES": usmAesCfb128Protocol, "DES": usmDESPrivProtocol}


def _auth_data():
    if settings.snmp_version == "v2c":
        return CommunityData(settings.snmp_community, mpModel=1)
    return UsmUserData(
        settings.snmp_user,
        authKey=settings.snmp_auth_key,
        privKey=settings.snmp_priv_key,
        authProtocol=AUTH_PROTOS.get(settings.snmp_auth_proto.upper(), usmHMACSHAAuthProtocol),
        privProtocol=PRIV_PROTOS.get(settings.snmp_priv_proto.upper(), usmAesCfb128Protocol),
    )


def _transport() -> UdpTransportTarget:
    return UdpTransportTarget(
        (settings.firewall_host, settings.snmp_port),
        timeout=settings.snmp_timeout_s,
        retries=settings.snmp_retries,
    )


class SnmpReadError(Exception):
    pass


async def snmp_get(oids: list[str]) -> dict[str, Any]:
    """Read-only SNMP GET. Never use SET."""
    engine = SnmpEngine()
    try:
        obj_types = [ObjectType(ObjectIdentity(o)) for o in oids]
        err_indication, err_status, _err_idx, var_binds = await getCmd(
            engine, _auth_data(), _transport(), ContextData(), *obj_types
        )
        if err_indication:
            raise SnmpReadError(f"SNMP error: {err_indication}")
        if err_status:
            raise SnmpReadError(f"SNMP status error: {err_status.prettyPrint()}")
        return {str(vb[0]): _normalize(vb[1]) for vb in var_binds}
    finally:
        engine.transportDispatcher.closeDispatcher()


async def snmp_walk(base_oid: str, max_iters: int = 500) -> dict[str, Any]:
    """Read-only walk via GETBULK. Handles both flat (list[ObjectType]) and
    nested (list[list[ObjectType]]) response shapes returned by pysnmp 6.x."""
    engine = SnmpEngine()
    out: dict[str, Any] = {}
    next_oid = ObjectType(ObjectIdentity(base_oid))
    iters = 0
    try:
        while iters < max_iters:
            iters += 1
            err_indication, err_status, _err_idx, var_binds_table = await bulkCmd(
                engine, _auth_data(), _transport(), ContextData(),
                0, 25, next_oid,
            )
            if err_indication:
                raise SnmpReadError(f"SNMP error: {err_indication}")
            if err_status:
                raise SnmpReadError(f"SNMP status error: {err_status.prettyPrint()}")
            if not var_binds_table:
                break

            # Flatten: pysnmp 6.x bulkCmd returns list[list[ObjectType]]
            flat: list = []
            for item in var_binds_table:
                if isinstance(item, list):
                    flat.extend(item)
                else:
                    flat.append(item)

            done = False
            last_oid_obj = None
            for vb in flat:
                try:
                    name = str(vb[0])
                    value = vb[1]
                except (IndexError, TypeError):
                    done = True
                    break
                value_str = value.prettyPrint() if hasattr(value, "prettyPrint") else str(value)
                if value_str.startswith("No more variables") or "endOfMibView" in value_str:
                    done = True
                    break
                if not (name == base_oid or name.startswith(base_oid + ".")):
                    done = True
                    break
                out[name] = _normalize(value)
                last_oid_obj = vb[0]
            if done or last_oid_obj is None:
                break
            next_oid = ObjectType(last_oid_obj)
        return out
    finally:
        engine.transportDispatcher.closeDispatcher()


def _normalize(value: Any) -> Any:
    s = value.prettyPrint() if hasattr(value, "prettyPrint") else str(value)
    try:
        return int(s)
    except (ValueError, TypeError):
        return s


async def snmp_get_remote(host: str, community: str, oids: list[str],
                          timeout: float = 1.5, retries: int = 1) -> dict[str, Any]:
    """Lightweight SNMPv2c GET to an arbitrary host. Used for device probing.
    Raises SnmpReadError on any error."""
    engine = SnmpEngine()
    try:
        target = UdpTransportTarget((host, 161), timeout=timeout, retries=retries)
        obj_types = [ObjectType(ObjectIdentity(o)) for o in oids]
        err_indication, err_status, _err_idx, var_binds = await getCmd(
            engine, CommunityData(community, mpModel=1), target, ContextData(), *obj_types,
        )
        if err_indication:
            raise SnmpReadError(f"SNMP error: {err_indication}")
        if err_status:
            raise SnmpReadError(f"SNMP status error: {err_status.prettyPrint()}")
        return {str(vb[0]): _normalize(vb[1]) for vb in var_binds}
    finally:
        engine.transportDispatcher.closeDispatcher()


async def health_check() -> bool:
    """Ping SNMP agent with sysName.0. Returns True on success."""
    try:
        from .oids import SYS_NAME
        result = await snmp_get([SYS_NAME])
        return bool(result)
    except Exception as e:
        log.warning("SNMP health_check failed: %s", e)
        return False
