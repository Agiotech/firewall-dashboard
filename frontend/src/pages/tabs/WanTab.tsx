import { SectionTitle } from '../../components/layout/SectionTitle'
import { WANTrafficChart } from '../../components/charts/WANTrafficChart'
import { LatencyPercentilesChart } from '../../components/charts/LatencyPercentilesChart'
import { WANGanttTimeline } from '../../components/charts/WANGanttTimeline'
import { CalendarHeatmap } from '../../components/charts/CalendarHeatmap'
import { WANSaturationGroup } from '../../components/charts/WANSaturationGroup'
import { WANConsumptionGroup } from '../../components/charts/WANConsumptionGroup'
import { AnomalyBands } from '../../components/charts/AnomalyBands'
import { OutageInvestigation } from '../../components/charts/OutageInvestigation'
import { HardwareCards } from '../../components/cards/HardwareCards'

interface Props {
  wanNames: string[]
  wanLabels: Record<string, string>
}

export function WanTab({ wanNames, wanLabels }: Props) {
  return (
    <div className="space-y-10">
      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="wan-traffic">Tráfico WAN (última hora)</SectionTitle>
          <WANTrafficChart wans={wanNames} labels={wanLabels} range="1h" />
        </section>
      )}

      <section>
        <SectionTitle helpKey="latency-percentiles">Calidad de internet</SectionTitle>
        <LatencyPercentilesChart range="1h" />
      </section>

      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="wan-availability">Caídas y disponibilidad</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WANGanttTimeline wans={wanNames} labels={wanLabels} range="7d" />
            <div className="space-y-4">
              {wanNames.map((w) => (
                <CalendarHeatmap key={w} wan={w} label={wanLabels[w]} days={90} />
              ))}
            </div>
          </div>
        </section>
      )}

      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="wan-saturation-heatmap">Patrón de saturación hora × día</SectionTitle>
          <WANSaturationGroup wans={wanNames} labels={wanLabels} range="30d" />
        </section>
      )}

      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="wan-consumption-heatmap">Consumo total hora × día por WAN</SectionTitle>
          <WANConsumptionGroup wans={wanNames} labels={wanLabels} range="30d" />
        </section>
      )}

      {wanNames.length > 0 && (
        <section>
          <SectionTitle helpKey="anomaly-bands">Detección de anomalías (vs baseline histórico)</SectionTitle>
          <AnomalyBands wans={wanNames} labels={wanLabels} />
        </section>
      )}

      <section>
        <SectionTitle helpKey="outage-investigation">
          Investigación forense de caídas
        </SectionTitle>
        <OutageInvestigation />
      </section>

      <section>
        <SectionTitle helpKey="hardware">Hardware del firewall</SectionTitle>
        <HardwareCards />
      </section>
    </div>
  )
}
