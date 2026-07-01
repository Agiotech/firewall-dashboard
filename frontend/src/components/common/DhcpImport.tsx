import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, X, CheckCircle, AlertTriangle } from 'lucide-react'

import { api } from '../../api/client'
import { colors } from '../../theme/colors'

interface Props {
  open: boolean
  onClose: () => void
}

type Status = { kind: 'idle' } | { kind: 'success'; n: number } | { kind: 'error'; msg: string }

export function DhcpImport({ open, onClose }: Props) {
  const [count, setCount] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    api.dhcpStats().then((s) => setCount(s.count)).catch(() => {})
  }, [open])

  if (!open) return null

  const handleFile = async (file: File) => {
    setUploading(true)
    setStatus({ kind: 'idle' })
    try {
      const text = await file.text()
      const res = await api.dhcpImport(text, file.name)
      setStatus({ kind: 'success', n: res.imported })
      const s = await api.dhcpStats()
      setCount(s.count)
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof Error ? e.message : 'Error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[14px] w-full max-w-[560px] p-6"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.28)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center"
              style={{ backgroundColor: colors.chartCyan + '1a' }}
            >
              <FileSpreadsheet size={18} style={{ color: colors.chartCyan }} strokeWidth={1.8} />
            </div>
            <div>
              <p
                className="text-[14px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Importar reservas DHCP
              </p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#4d5e85] dark:text-[#a8c4cc]">
                {count !== null ? `${count} registros actuales` : 'cargando...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f]"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-[12px] text-[#3c494c] dark:text-[#c0d4da] mb-4 leading-relaxed">
          Exporta la tabla del USG desde{' '}
          <span className="font-mono text-[11px] bg-[#eef4f8] dark:bg-[#252c2f] px-1.5 py-0.5 rounded">
            Object → IP-MAC Binding
          </span>{' '}
          (boton Export) y sube el CSV aqui. El dashboard usara hostname y description para
          enriquecer alertas, top hosts y dispositivos detectados.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full py-3 rounded-[10px] flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"
          style={{
            backgroundColor: colors.chartCyan,
            color: 'white',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          <Upload size={14} strokeWidth={2} />
          {uploading ? 'Procesando...' : 'Elegir archivo CSV'}
        </button>

        {status.kind === 'success' && (
          <div
            className="mt-4 p-3 rounded-[10px] flex items-center gap-2 text-[12px]"
            style={{ backgroundColor: colors.chartGreen + '1a', color: colors.chartGreen }}
          >
            <CheckCircle size={14} strokeWidth={2} />
            <span style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {status.n} registros importados.
            </span>
          </div>
        )}
        {status.kind === 'error' && (
          <div
            className="mt-4 p-3 rounded-[10px] flex items-center gap-2 text-[12px]"
            style={{ backgroundColor: colors.chartRed + '1a', color: colors.chartRed }}
          >
            <AlertTriangle size={14} strokeWidth={2} />
            <span style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{status.msg}</span>
          </div>
        )}

        <details className="mt-4 text-[11px] text-[#4d5e85] dark:text-[#a8c4cc]">
          <summary className="cursor-pointer font-bold uppercase tracking-[0.08em]">
            Formato esperado
          </summary>
          <pre
            className="mt-2 p-2 bg-[#eef4f8] dark:bg-[#252c2f] rounded text-[10px] overflow-x-auto"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >{`#,Interface,IP Address,Host Name,MAC Address,VLAN ID,Description,Status
1,P6-Product,192.168.1.86,IT142Rolando,F4:39:09:3A:2D:4F,,TEC SEM ROLANDO,Reserved
...`}</pre>
          <p className="mt-2 leading-relaxed">
            Tambien acepta separador <code>;</code>, encabezados en espanol (Direccion IP, Nombre,
            Descripcion) y JSON array via Content-Type application/json.
          </p>
        </details>
      </div>
    </div>
  )
}
