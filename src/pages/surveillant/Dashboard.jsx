import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import { ShieldCheck, Check, X, Clock, AlertTriangle, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUTS = [
  { value: 'present',          label: 'Présent',           color: 'green' },
  { value: 'absent',           label: 'Absent',            color: 'red' },
  { value: 'absent_justifie',  label: 'Absent (justifié)', color: 'yellow' },
  { value: 'retard',           label: 'Retard',            color: 'yellow' },
]

const TYPES_INCIDENT = [
  { value: 'avertissement',         label: 'Avertissement' },
  { value: 'retenue',                label: 'Retenue' },
  { value: 'exclusion_temporaire',   label: 'Exclusion temporaire' },
  { value: 'autre',                  label: 'Autre' },
]

export default function SurveillantDashboard() {
  const { schoolId, profile } = useAuth()
  const [classes, setClasses] = useState([])
  const [selectedClasse, setSelectedClasse] = useState('')
  const [eleves, setEleves] = useState([])
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [today] = useState(new Date().toISOString().slice(0, 10))

  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false)
  const [selectedEleve, setSelectedEleve] = useState(null)
  const [disciplineForm, setDisciplineForm] = useState({ type_incident: 'avertissement', description: '', sanction: '' })

  useEffect(() => {
    if (schoolId) fetchClasses()
  }, [schoolId])

  useEffect(() => {
    if (selectedClasse) fetchEleves()
  }, [selectedClasse])

  async function fetchClasses() {
    const { data } = await supabase.from('classes').select('id, nom').eq('school_id', schoolId).order('nom')
    setClasses(data || [])
    if (data?.length) setSelectedClasse(data[0].id)
    else setLoading(false)
  }

  async function fetchEleves() {
    setLoading(true)
    const { data: students } = await supabase
      .from('students')
      .select('id, prenom, nom')
      .eq('classe_id', selectedClasse)
      .order('nom')

    setEleves(students || [])

    // Charger les présences du jour pour cette classe
    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('classe_id', selectedClasse)
      .eq('date_jour', today)

    const map = {}
    records?.forEach(r => { map[r.student_id] = r })
    setAttendance(map)
    setLoading(false)
  }

  async function setStatut(studentId, statut) {
    setSaving(true)
    try {
      const payload = {
        school_id:      schoolId,
        student_id:     studentId,
        classe_id:      selectedClasse,
        date_jour:      today,
        statut,
        heure_arrivee:  statut === 'retard' ? new Date().toTimeString().slice(0, 5) : null,
        enregistre_par: profile.id,
      }

      const { data, error } = await supabase
        .from('attendance_records')
        .upsert(payload, { onConflict: 'student_id,date_jour' })
        .select()
        .single()

      if (error) throw error

      setAttendance(prev => ({ ...prev, [studentId]: data }))
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function ouvrirDiscipline(eleve) {
    setSelectedEleve(eleve)
    setDisciplineForm({ type_incident: 'avertissement', description: '', sanction: '' })
    setDisciplineModalOpen(true)
  }

  async function enregistrerIncident() {
    if (!disciplineForm.description.trim()) {
      toast.error('Veuillez décrire l\'incident')
      return
    }

    try {
      const { error } = await supabase.from('discipline_records').insert({
        school_id:    schoolId,
        student_id:   selectedEleve.id,
        classe_id:    selectedClasse,
        type_incident: disciplineForm.type_incident,
        description:  disciplineForm.description.trim(),
        sanction:     disciplineForm.sanction || null,
        signale_par:  profile.id,
      })

      if (error) throw error
      toast.success('Incident enregistré')
      setDisciplineModalOpen(false)
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    }
  }

  // Stats du jour
  const presents     = Object.values(attendance).filter(a => a.statut === 'present').length
  const absents      = Object.values(attendance).filter(a => ['absent', 'absent_justifie'].includes(a.statut)).length
  const retards      = Object.values(attendance).filter(a => a.statut === 'retard').length
  const nonMarques   = eleves.length - Object.keys(attendance).length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Présences & Discipline</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date(today).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Sélecteur de classe */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {classes.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClasse(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
                  ${selectedClasse === c.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {c.nom}
              </button>
            ))}
          </div>
        </Card>

        {/* Stats du jour */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Présents</p>
            <p className="text-2xl font-black text-green-600 mt-1">{presents}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Absents</p>
            <p className="text-2xl font-black text-red-500 mt-1">{absents}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Retards</p>
            <p className="text-2xl font-black text-yellow-500 mt-1">{retards}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Non marqués</p>
            <p className="text-2xl font-black text-gray-400 mt-1">{nonMarques}</p>
          </Card>
        </div>

        {/* Liste des élèves */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : eleves.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Aucun élève dans cette classe" />
          ) : (
            <div className="divide-y divide-gray-50">
              {eleves.map(e => {
                const record = attendance[e.id]
                return (
                  <div key={e.id} className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
                    <p className="font-medium text-gray-900">{e.prenom} {e.nom}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setStatut(e.id, 'present')}
                          className={`p-1.5 rounded-md transition-colors
                            ${record?.statut === 'present' ? 'bg-green-500 text-white' : 'text-gray-400 hover:bg-gray-200'}`}
                          title="Présent"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setStatut(e.id, 'retard')}
                          className={`p-1.5 rounded-md transition-colors
                            ${record?.statut === 'retard' ? 'bg-yellow-500 text-white' : 'text-gray-400 hover:bg-gray-200'}`}
                          title="Retard"
                        >
                          <Clock size={14} />
                        </button>
                        <button
                          onClick={() => setStatut(e.id, 'absent')}
                          className={`p-1.5 rounded-md transition-colors
                            ${record?.statut === 'absent' ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-200'}`}
                          title="Absent"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => ouvrirDiscipline(e)}
                        className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                        title="Signaler un incident"
                      >
                        <AlertTriangle size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Modal incident disciplinaire */}
      <Modal isOpen={disciplineModalOpen} onClose={() => setDisciplineModalOpen(false)}
        title={`Signaler un incident — ${selectedEleve?.prenom} ${selectedEleve?.nom}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type d'incident *</label>
            <select
              value={disciplineForm.type_incident}
              onChange={e => setDisciplineForm({ ...disciplineForm, type_incident: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TYPES_INCIDENT.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              rows={3}
              placeholder="Décrivez l'incident..."
              value={disciplineForm.description}
              onChange={e => setDisciplineForm({ ...disciplineForm, description: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sanction (optionnel)</label>
            <input
              type="text"
              placeholder="ex: Retenue le samedi"
              value={disciplineForm.sanction}
              onChange={e => setDisciplineForm({ ...disciplineForm, sanction: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDisciplineModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" className="flex-1" onClick={enregistrerIncident}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
