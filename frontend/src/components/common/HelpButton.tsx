import { useState, useEffect } from 'react'
import { HelpCircle, X, Info, Database, Calculator, Eye, AlertTriangle } from 'lucide-react'

import { getHelp, type ChartHelp } from '../../utils/chartHelp'
import { colors } from '../../theme/colors'

interface Props {
  helpKey: string
}

export function HelpButton({ helpKey }: Props) {
  const [open, setOpen] = useState(false)
  const help = getHelp(helpKey)
  if (!help) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[#4d5e85] dark:text-[#a8c4cc] hover:bg-[#eef4f8] dark:hover:bg-[#252c2f] hover:text-[#006876] dark:hover:text-[#00b6cc] transition-colors"
        title="¿Cómo se interpreta esta gráfica?"
        aria-label="Ayuda"
      >
        <HelpCircle size={14} strokeWidth={2} />
      </button>
      {open && <HelpModal help={help} onClose={() => setOpen(false)} />}
    </>
  )
}

function HelpModal({ help, onClose }: { help: ChartHelp; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e2528] rounded-[14px] w-full max-w-[720px] max-h-[90vh] overflow-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.32)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 border-b border-[#e9eff3] dark:border-[#252c2f] bg-white dark:bg-[#1e2528]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: colors.chartCyan + '1a' }}
            >
              <HelpCircle size={18} style={{ color: colors.chartCyan }} strokeWidth={1.8} />
            </div>
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Ayuda
              </p>
              <p
                className="text-[15px] font-bold text-[#161c1f] dark:text-[#ecf2f6]"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {help.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-[#eef4f8] dark:hover:bg-[#252c2f]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-5 space-y-5">
          <Section icon={Info} title="¿Qué representa?" color={colors.chartCyan}>
            <p className="text-[12px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da]">
              {help.what}
            </p>
          </Section>

          <Section icon={Database} title="Fuente de datos" color={colors.chartBlue}>
            <p className="text-[12px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da]">
              {help.dataSource}
            </p>
          </Section>

          <Section icon={Calculator} title="Cómo se calcula" color={colors.chartIndigo}>
            <p
              className="text-[11px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da] p-3 rounded-[8px] bg-[#f4fafe] dark:bg-[#252c2f]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {help.formula}
            </p>
          </Section>

          <Section icon={Eye} title="Cómo interpretarlo" color={colors.chartGreen}>
            <ul className="space-y-1.5">
              {help.interpretation.map((item, i) => (
                <li
                  key={i}
                  className="text-[12px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da] pl-4 relative"
                >
                  <span
                    className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: colors.chartGreen }}
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          {help.caveats && help.caveats.length > 0 && (
            <Section icon={AlertTriangle} title="Limitaciones y consideraciones" color={colors.chartAmber}>
              <ul className="space-y-1.5">
                {help.caveats.map((item, i) => (
                  <li
                    key={i}
                    className="text-[12px] leading-relaxed text-[#3c494c] dark:text-[#c0d4da] pl-4 relative"
                  >
                    <span
                      className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: colors.chartAmber }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <footer className="sticky bottom-0 px-6 py-3 border-t border-[#e9eff3] dark:border-[#252c2f] bg-[#f4fafe] dark:bg-[#252c2f]">
          <p className="text-[10px] text-[#4d5e85] dark:text-[#a8c4cc] text-center" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Cierra con Esc o click fuera del recuadro
          </p>
        </footer>
      </div>
    </div>
  )
}

function Section({
  icon: Icon, title, color, children,
}: {
  icon: any
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }} strokeWidth={2.2} />
        <p
          className="text-[10px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          {title}
        </p>
      </div>
      {children}
    </section>
  )
}
