import { SectionTitle } from '../../components/layout/SectionTitle'
import { LANPortsGrid } from '../../components/lists/LANPortsGrid'
import { LanErrorsHeatmap } from '../../components/charts/LanErrorsHeatmap'
import { InventoryGrid } from '../../components/lists/InventoryGrid'
import { VendorDonut } from '../../components/charts/VendorDonut'
import { NewDevicesList } from '../../components/lists/NewDevicesList'

export function LanTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionTitle helpKey="lan-ports">Puertos LAN / SFP</SectionTitle>
        <LANPortsGrid />
      </section>

      <section>
        <SectionTitle helpKey="lan-errors">Errores por puerto LAN (heatmap)</SectionTitle>
        <LanErrorsHeatmap range="24h" />
      </section>

      <section>
        <SectionTitle helpKey="devices-consumption">Consumo por dispositivo (inventario)</SectionTitle>
        <InventoryGrid />
      </section>

      <section>
        <SectionTitle helpKey="devices-inventory">Inventario de dispositivos</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VendorDonut />
          <NewDevicesList />
        </div>
      </section>
    </div>
  )
}
