import { SectionTitle } from '../../components/layout/SectionTitle'
import { VpnSection } from '../../components/lists/VpnSection'
import { VpnUptimeGauges } from '../../components/charts/VpnUptimeGauges'
import { VpnTrafficBar } from '../../components/charts/VpnTrafficBar'
import { VpnUsageHeatmap } from '../../components/charts/VpnUsageHeatmap'
import { VpnDailyHeatmap } from '../../components/charts/VpnDailyHeatmap'
import { BranchesMap } from '../../components/charts/BranchesMap'

export function VpnTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionTitle helpKey="vpn-overview">VPN — Site-to-Site y Clientes</SectionTitle>
        <VpnSection />
      </section>

      <section>
        <SectionTitle helpKey="vpn-uptime">Uptime por túnel</SectionTitle>
        <VpnUptimeGauges />
      </section>

      <section>
        <SectionTitle helpKey="vpn-traffic">Tráfico por túnel</SectionTitle>
        <VpnTrafficBar range="24h" />
      </section>

      <section>
        <SectionTitle helpKey="vpn-usage-heatmap">Uso semanal por hora (VPN)</SectionTitle>
        <VpnUsageHeatmap />
      </section>

      <section>
        <SectionTitle helpKey="vpn-daily-heatmap">Consumo diario por VPN</SectionTitle>
        <VpnDailyHeatmap />
      </section>

      <section>
        <SectionTitle helpKey="branches-map">Mapa geográfico de sucursales</SectionTitle>
        <BranchesMap />
      </section>
    </div>
  )
}
