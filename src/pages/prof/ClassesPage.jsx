import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Badge, EmptyState } from '../../components/ui'
import { BookOpen, Users } from 'lucide-react'

export default function ProfClasses() {
  const { profile } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) fetchClasses() }, [profile])

  async function fetchClasses() {
    // 1. Récupérer les affectations prof avec classes et matières
    const { data: affectations } = await supabase
      .from('prof_classes')
      .select('*, classes(id, nom, annee_scolaire, students(count)), subjects(id, nom, coefficient)')
      .eq('prof_id', profile.id)

    if (!affectations?.length) { setClasses([]); setLoading(false); return }

    // 2. Récupérer les coefficients réels depuis class_subjects
    const classIds   = [...new Set(affectations.map(a => a.class_id))]
    const subjectIds = [...new Set(affectations.map(a => a.subject_id))]

    const { data: classSubjects } = await supabase
      .from('class_subjects')
      .select('class_id, subject_id, coefficient')
      .in('class_id',   classIds)
      .in('subject_id', subjectIds)

    // 3. Fusionner : priorité class_subjects > subjects global
    const merged = affectations.map(a => {
      const cs = classSubjects?.find(
        x => x.class_id === a.class_id && x.subject_id === a.subject_id
      )
      return {
        ...a,
        coefficient: cs?.coefficient ?? a.subjects?.coefficient ?? 1,
      }
    })

    setClasses(merged)
    setLoading(false)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mes classes</h1>
          <p className="text-gray-500 text-sm">{classes.length} affectation(s)</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="Aucune classe assignée"
              description="L'administrateur doit vous affecter à des classes"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map(item => (
              <Card key={item.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center font-bold text-primary-700 text-sm">
                    {item.classes?.nom?.slice(0, 2)}
                  </div>
                  <Badge color="blue">{item.classes?.annee_scolaire}</Badge>
                </div>
                <h3 className="font-bold text-gray-900 text-lg">{item.classes?.nom}</h3>
                <p className="text-sm text-primary-600 font-medium mt-1">
                  {item.subjects?.nom} — Coef. {item.coefficient}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                  <Users size={12} />
                  {item.classes?.students?.[0]?.count || 0} élève(s)
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
