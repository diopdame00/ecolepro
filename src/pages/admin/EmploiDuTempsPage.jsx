import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../components/ui'
import { CalendarDays, Plus, Trash2, MapPin } from 'lucide-react'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { SelecteurAnnee, BandeauArchive } from '../../components/shared/SelecteurAnnee'
import toast from 'react-hot-toast'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export default function EmploiDuTempsAdmin() {
  const { schoolId } = useAuth()
  const { annee, anneeActive, anneesDispos, anneeSelectionnee, setAnneeSelectionnee, enModeArchive } = useAnneeActive()
  const [slots, setSlots] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [profs, setProfs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedClasse, setSelectedClasse] = useState('')

  const [form, setForm] = useState({
    classe_id: '', subject_id: '', prof_id: '',
    jour_semaine: '1', heure_debut: '08:00', heure_fin: '09:00', salle: '',
  })

  useEffect(() => {
    if (schoolId && annee) fetchAll()
  }, [schoolId, annee])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchSlots(), fetchClasses(), fetchSubjects(), fetchProfs()])
    setLoading(false)
  }

  async function fetchSlots() {
    const { data, error } = await supabase
      .from('timetable_slots')
      .select(`
        *,
        classes:classe_id(nom),
        subjects:subject_id(nom),
        users:prof_id(prenom, nom)
      `)
      .eq('school_id', schoolId)
      .order('jour_semaine')
      .order('heure_debut')

    if (!error) setSlots(data || [])
    else console.error(error)
  }

  async function fetchClasses() {
    if (!annee) return
    const { data } = await supabase.from('classes').select('id, nom, annee_scolaire').eq('school_id', schoolId).eq('annee_scolaire', annee).order('nom')
    setClasses(data || [])
    if (data?.length && !selectedClasse) setSelectedClasse(data[0].id)
  }

  async function fetchSubjects() {
    const { data } = await supabase.from('subjects').select('id, nom').eq('school_id', schoolId).order('nom')
    setSubjects(data || [])
  }

  async function fetchProfs() {
    const { data } = await supabase.from('users').select('id, prenom, nom').eq('school_id', schoolId).eq('role', 'prof').order('nom')
    setProfs(data || [])
  }

  async function ajouterCreneau() {
    if (!form.classe_id || !form.subject_id || !form.prof_id || !form.heure_debut || !form.heure_fin) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    if (form.heure_fin <= form.heure_debut) {
      toast.error("L'heure de fin doit être après l'heure de début")
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('timetable_slots').insert({
        school_id:    schoolId,
        classe_id:    form.classe_id,
        subject_id:   form.subject_id,
        prof_id:      form.prof_id,
        jour_semaine: parseInt(form.jour_semaine),
        heure_debut:  form.heure_debut,
        heure_fin:    form.heure_fin,
        salle:        form.salle || null,
      })

      if (error) {
        if (error.code === '23505') {
          throw new Error('Conflit : ce professeur ou cette salle est déjà occupé(e) sur ce créneau')
        }
        throw error
      }

      toast.success('Créneau ajouté')
      setModalOpen(false)
      fetchSlots()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function supprimerCreneau(id) {
    const { error } = await supabase.from('timetable_slots').delete().eq('id', id)
    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Créneau supprimé')
    fetchSlots()
  }

  const slotsClasse = slots.filter(s => s.classe_id === selectedClasse)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Emploi du temps</h1>
            <p className="text-gray-500 text-sm mt-0.5">Gérer les créneaux par classe</p>
          </div>
          {!enModeArchive && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              Ajouter un créneau
            </Button>
          )}
        </div>

        {enModeArchive && <BandeauArchive annee={annee} onRetour={() => setAnneeSelectionnee(null)} />}

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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slotsClasse.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="Aucun créneau pour cette classe"
              description="Ajoutez un créneau pour commencer à construire l'emploi du temps."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(jour => {
              const cours = slotsClasse.filter(s => s.jour_semaine === jour)
              if (cours.length === 0) return null
              return (
                <Card key={jour} className="p-0 overflow-hidden">
                  <div className="bg-gray-50 px-5 py-3">
                    <h2 className="font-bold text-gray-900">{JOURS[jour]}</h2>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {cours.map(c => (
                      <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-20 shrink-0 text-center">
                          <p className="font-bold text-gray-900 text-sm">{c.heure_debut?.slice(0, 5)}</p>
                          <p className="text-xs text-gray-400">{c.heure_fin?.slice(0, 5)}</p>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{c.subjects?.nom}</p>
                          <p className="text-sm text-gray-500">{c.users?.prenom} {c.users?.nom}</p>
                        </div>
                        {c.salle && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <MapPin size={12} />
                            {c.salle}
                          </div>
                        )}
                        <button
                          onClick={() => supprimerCreneau(c.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal ajout créneau */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Ajouter un créneau">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe *</label>
            <select
              value={form.classe_id}
              onChange={e => setForm({ ...form, classe_id: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sélectionner...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Matière *</label>
            <select
              value={form.subject_id}
              onChange={e => setForm({ ...form, subject_id: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sélectionner...</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Professeur *</label>
            <select
              value={form.prof_id}
              onChange={e => setForm({ ...form, prof_id: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sélectionner...</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jour *</label>
            <select
              value={form.jour_semaine}
              onChange={e => setForm({ ...form, jour_semaine: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {[1, 2, 3, 4, 5, 6].map(j => <option key={j} value={j}>{JOURS[j]}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Heure début *"
              type="time"
              value={form.heure_debut}
              onChange={e => setForm({ ...form, heure_debut: e.target.value })}
            />
            <Input
              label="Heure fin *"
              type="time"
              value={form.heure_fin}
              onChange={e => setForm({ ...form, heure_fin: e.target.value })}
            />
          </div>

          <Input
            label="Salle (optionnel)"
            placeholder="ex: Salle 12"
            value={form.salle}
            onChange={e => setForm({ ...form, salle: e.target.value })}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button className="flex-1" loading={saving} onClick={ajouterCreneau}>
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
