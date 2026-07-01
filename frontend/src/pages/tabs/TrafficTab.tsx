import { SectionTitle } from '../../components/layout/SectionTitle'
import { TopHostsBandwidthChart } from '../../components/charts/TopHostsBandwidthChart'
import { TopTalkersChart } from '../../components/charts/TopTalkersChart'
import { GeoMap } from '../../components/charts/GeoMap'

export function TrafficTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionTitle helpKey="top-hosts-bytes">Top consumo por host (bytes)</SectionTitle>
        <TopHostsBandwidthChart range="1h" limit={20} />
      </section>

      <section>
        <SectionTitle helpKey="top-talkers-events">Top talkers desde eventos</SectionTitle>
        <TopTalkersChart range="24h" />
      </section>

      <section>
        <SectionTitle helpKey="geo-external">Geo-map mundial — tráfico externo</SectionTitle>
        <GeoMap range="1h" />
      </section>
    </div>
  )
}
