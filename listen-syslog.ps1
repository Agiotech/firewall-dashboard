# Escucha UDP 5514 durante 30s e imprime cada mensaje recibido.
# Si el backend del dashboard ya esta corriendo, este script va a fallar
# porque el puerto esta tomado. Detenlo primero.
#
# Uso (como admin):
#   .\listen-syslog.ps1

param(
    [int]$Port = 5514,
    [int]$Seconds = 30
)

Write-Host "Escuchando UDP $Port durante $Seconds segundos..." -ForegroundColor Cyan
Write-Host "Genera trafico en el firewall (logueate y desloguea, o haz ping a una IP bloqueada)`n" -ForegroundColor Yellow

try {
    $listener = New-Object System.Net.Sockets.UdpClient $Port
} catch {
    Write-Host "No se pudo abrir UDP ${Port}: $_" -ForegroundColor Red
    Write-Host "Probablemente el backend del dashboard ya esta corriendo y tomo el puerto." -ForegroundColor Yellow
    exit 1
}

$listener.Client.ReceiveTimeout = $Seconds * 1000
$received = 0
$start = Get-Date

try {
    while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
        $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        try {
            $bytes = $listener.Receive([ref]$ep)
        } catch [System.Net.Sockets.SocketException] {
            break
        }
        $msg = [System.Text.Encoding]::UTF8.GetString($bytes)
        $received++
        Write-Host "[$received] from $($ep.Address)" -ForegroundColor Green
        Write-Host "       $($msg.Trim())" -ForegroundColor White
    }
} finally {
    $listener.Close()
}

Write-Host ""
if ($received -eq 0) {
    Write-Host "Sin mensajes en $Seconds segundos." -ForegroundColor Red
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "  1. Windows Firewall esta bloqueando UDP $Port (revisa la regla del Paso 0)"
    Write-Host "  2. La config en el USG no esta Activa o apunta a otra IP"
    Write-Host "  3. El USG no genero eventos en esta ventana - provoca alguno"
} else {
    Write-Host "Recibidos $received mensajes. Syslog funcionando." -ForegroundColor Green
}
