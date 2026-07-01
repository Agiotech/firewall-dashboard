import { SectionTitle } from '../../components/layout/SectionTitle'
import { AttackTimeline } from '../../components/charts/AttackTimeline'
import { EventsSeverityChart } from '../../components/charts/EventsSeverityChart'
import { EventsHourDayHeatmap } from '../../components/charts/EventsHourDayHeatmap'
import { EventsFeed } from '../../components/lists/EventsFeed'

export function SecurityTab() {
  return (
    <div className="space-y-10">
      <section>
        <SectionTitle helpKey="attacks-classified">Intentos desde Internet (clasificados)</SectionTitle>
        <AttackTimeline range="24h" />
      </section>

      <section>
        <SectionTitle helpKey="events-severity">Eventos por severidad</SectionTitle>
        <EventsSeverityChart range="6h" />
      </section>

      <section>
        <SectionTitle helpKey="events-hour-day">Patrón de eventos hora × día</SectionTitle>
        <EventsHourDayHeatmap range="7d" />
      </section>

      <section>
        <SectionTitle helpKey="events-feed">Eventos recientes</SectionTitle>
        <EventsFeed />
      </section>
    </div>
  )
}
