import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, EmptyState } from '../../components/ui'
import { CalendarDays, MapPin } from 'lucide-react'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const TODAY = new Date().getDay() // 0=Dimanche..6=Samedi → on mappe vers 1..6

export default function ProfEmploiDuTemps() {
  const { profile } = useAuth()
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) fetchTimetable()
  }, [profile?.id])

  async function fetchTimetable() {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        classes:classe_id(nom),
        subjects:subject_id(nom)
      `)
      .eq('prof_id', profile.id)
      .order('jour_semaine')
      .order('heure_debut')

    if (!error) setSlots(data || [])
    setLoading(false)
  }

  const todayIndex = TODAY === 0 ? 7 : TODAY // dimanche → 7 (pas de cours)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mon emploi du temps</h1>
          <p className="text-gray-500 text-sm mt-0.5">Consultez vos cours de la semaine</p>
        </div>
    {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="Emploi du temps non configuré"
              description="Votre administrateur n'a pas encore défini votre emploi du temps."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(jour => {
              const cours = slots.filter(s => s.jour_semaine === jour)
              if (cours.length === 0) return null
              const isToday = jour === todayIndex

              return (
                <Card key={jour} className="p-0 overflow-hidden">
                  <div className={`px-5 py-3 flex items-center justify-between
                    ${isToday ? 'bg-primary-600 text-white' : 'bg-gray-50'}`}>
                    <h2 className={`font-bold ${isToday ? 'text-white' : 'text-gray-900'}`}>
                      {JOURS[jour]}
                    </h2>
                    {isToday && (
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                        Aujourd'hui
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {cours.map(c => (
                      <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-20 shrink-0 text-center">
                          <p className="font-bold text-gray-900 text-sm">
                            {c.heure_debut?.slice(0, 5)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {c.heure_fin?.slice(0, 5)}
                          </p>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{c.subjects?.nom}</p>
                          <p className="text-sm text-gray-500">{c.classes?.nom}</p>
                        </div>
                        {c.salle && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <MapPin size={12} />
                            {c.salle}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
