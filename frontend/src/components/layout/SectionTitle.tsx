import { colors } from '../../theme/colors'
import { HelpButton } from '../common/HelpButton'

interface Props {
  children: string
  helpKey?: string
}

export function SectionTitle({ children, helpKey }: Props) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <p
        className="text-[12px] font-bold uppercase tracking-[0.10em] text-[#4d5e85] dark:text-[#a8c4cc] pl-3 border-l-2"
        style={{
          borderImage: `linear-gradient(180deg, ${colors.primary}, ${colors.primaryContainer}) 1`,
          fontFamily: 'Space Grotesk, sans-serif',
        }}
      >
        {children}
      </p>
      {helpKey && <HelpButton helpKey={helpKey} />}
    </div>
  )
}
