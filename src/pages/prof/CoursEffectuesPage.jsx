import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge } from '../../components/ui'
import { Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const STATUT_COLORS = { effectue: 'yellow', valide: 'green', rejete: 'red' }
const STATUT_LABELS = { effectue: 'En attente', valide: 'Validé', rejete: 'Rejeté' }

// ── Obtenir le lundi de la semaine d'une date ────────────────
function getLundi(date) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Formater une date en YYYY-MM-DD ─────────────────────────
function toISO(date) {
  return date.toISOString().slice(0, 10)
}

// ── Calculer durée en minutes ────────────────────────────────
function dureeMinutes(debut, fin) {
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  return (h2 * 60 + m2) - (h1 * 60 + m1)
}

function formatDuree(minutes) {
  if (!minutes || minutes <= 0) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`
}

export default function CoursEffectuesPage() {
  const { profile, schoolId } = useAuth()
  const [lundiSemaine, setLundiSemaine] = useState(getLundi(new Date()))
  const [slots, setSlots] = useState([])          // créneaux emploi du temps
  const [sessions, setSessions] = useState([])    // cours déjà déclarés
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total_heures: 0, nb_valides: 0, nb_en_attente: 0, nb_rejetes: 0 })

  // Modal absence
  const [absenceModal, setAbsenceModal] = useState(null)  // slot concerné
  const [motif, setMotif] = useState('')
  const [notifier, setNotifier] = useState(true)
  const [saving, setSaving] = useState(null)  // id du slot en cours

  // Modal sujet (pour cours effectué)
  const [sujetModal, setSujetModal] = useState(null)
  const [sujet, setSujet] = useState('')

  useEffect(() => {
    if (profile?.id) {
      fetchSlots()
      fetchSessions()
      fetchStats()
    }
  }, [profile?.id, lundiSemaine])

  // ── Créneaux de la semaine depuis l'emploi du temps ──────
  async function fetchSlots() {
    setLoading(true)
    const { data } = await supabase
      .from('timetable_slots')
      .select('*, classes:classe_id(nom), subjects:subject_id(nom)')
      .eq('school_id', schoolId)
      .eq('prof_id', profile.id)
      .order('jour_semaine')
      .order('heure_debut')
    setSlots(data || [])
    setLoading(false)
  }

  // ── Sessions déclarées pour cette semaine ────────────────
  async function fetchSessions() {
    const dimanche = new Date(lundiSemaine)
    dimanche.setDate(dimanche.getDate() + 6)
    const { data } = await supabase
      .from('course_sessions')
      .select('*')
      .eq('prof_id', profile.id)
      .gte('date_cours', toISO(lundiSemaine))
      .lte('date_cours', toISO(dimanche))
    setSessions(data || [])
  }

  // ── Stats du mois ────────────────────────────────────────
  async function fetchStats() {
    const debut = new Date()
    debut.setDate(1)
    const { data } = await supabase
      .from('course_sessions')
      .select('statut, duree_minutes')
      .eq('prof_id', profile.id)
      .gte('date_cours', toISO(debut))
    if (data) {
      const valides = data.filter(d => d.statut === 'valide')
      setStats({
        total_heures:  (valides.reduce((a, d) => a + (d.duree_minutes || 0), 0) / 60).toFixed(1),
        nb_valides:    valides.length,
        nb_en_attente: data.filter(d => d.statut === 'effectue').length,
        nb_rejetes:    data.filter(d => d.statut === 'rejete').length,
      })
    }
  }

  // ── Obtenir la date réelle d'un créneau dans la semaine ──
  function getDateCreneau(jourSemaine) {
    const d = new Date(lundiSemaine)
    d.setDate(d.getDate() + jourSemaine - 1)
    return toISO(d)
  }

  // ── Chercher si un créneau a déjà une session cette semaine
  function getSession(slot) {
    const dateCreneau = getDateCreneau(slot.jour_semaine)
    return sessions.find(s =>
      s.classe_id   === slot.classe_id &&
      s.subject_id  === slot.subject_id &&
      s.date_cours  === dateCreneau
    )
  }

  // ── Marquer un cours comme effectué ─────────────────────
  async function marquerEffectue(slot, sujetTraite = '') {
    setSaving(slot.id)
    try {
      const dateCours  = getDateCreneau(slot.jour_semaine)
      const duree      = dureeMinutes(slot.heure_debut, slot.heure_fin)
      const { error }  = await supabase.from('course_sessions').insert({
        school_id:    schoolId,
        prof_id:      profile.id,
        classe_id:    slot.classe_id,
        subject_id:   slot.subject_id,
        date_cours:    dateCours,
        heure_debut:   slot.heure_debut,
        heure_fin:     slot.heure_fin,
        duree_minutes: duree > 0 ? duree : null,
        sujet_traite:  sujetTraite || null,
        statut:        'effectue',
      })
      if (error) throw error
      toast.success('Cours marqué comme effectué')
      setSujetModal(null)
      setSujet('')
      fetchSessions()
      fetchStats()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  // ── Déclarer une absence sur un créneau ─────────────────
  async function declarerAbsence() {
    if (!motif.trim()) { toast.error('Veuillez indiquer un motif'); return }
    setSaving(absenceModal.id)
    try {
      const dateCours = getDateCreneau(absenceModal.jour_semaine)
      const duree     = dureeMinutes(absenceModal.heure_debut, absenceModal.heure_fin)
      const { error } = await supabase.from('course_sessions').insert({
        school_id:    schoolId,
        prof_id:      profile.id,
        classe_id:    absenceModal.classe_id,
        subject_id:   absenceModal.subject_id,
        date_cours:      dateCours,
        heure_debut:     absenceModal.heure_debut,
        heure_fin:       absenceModal.heure_fin,
        duree_minutes:   duree > 0 ? duree : null,
        statut:          'absent',
        motif_absence:  motif.trim(),
        notifier_eleves: notifier,
      })
      if (error) throw error
      toast.success('Absence déclarée')
      setAbsenceModal(null)
      setMotif('')
      setNotifier(true)
      fetchSessions()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  // ── Annuler une déclaration ──────────────────────────────
  async function annulerDeclaration(sessionId) {
    if (!confirm('Annuler cette déclaration ?')) return
    const { error } = await supabase
      .from('course_sessions').delete().eq('id', sessionId)
    if (error) { toast.error('Erreur'); return }
    toast.success('Déclaration annulée')
    fetchSessions()
    fetchStats()
  }

  // ── Navigation semaine ───────────────────────────────────
  function semainePrec() {
    const d = new Date(lundiSemaine)
    d.setDate(d.getDate() - 7)
    setLundiSemaine(d)
  }
  function semaineSuiv() {
    const d = new Date(lundiSemaine)
    d.setDate(d.getDate() + 7)
    setLundiSemaine(d)
  }



  const dimanche = new Date(lundiSemaine)
  dimanche.setDate(dimanche.getDate() + 6)

  // Semaine suivante max autorisée (pour décliner à l'avance)
  const lundiProchain = getLundi(new Date())
  lundiProchain.setDate(lundiProchain.getDate() + 7)
  const estSemaineMaxFutur = toISO(lundiSemaine) >= toISO(lundiProchain)

  const formatSemaine = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const estSemaineActuelle = toISO(getLundi(new Date())) === toISO(lundiSemaine)
  const estSemaineFuture = lundiSemaine > getLundi(new Date())

  // Grouper les slots par jour
  const slotsByJour = {}
  for (let j = 1; j <= 6; j++) {
    const joursSlots = slots.filter(s => s.jour_semaine === j)
    if (joursSlots.length) slotsByJour[j] = joursSlots
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Mes cours</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Validez vos cours effectués ou déclarez vos absences
          </p>
        </div>

        {/* Stats mois */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Heures validées (mois)', value: `${stats.total_heures}h`, color: 'text-green-600' },
            { label: 'Cours validés',          value: stats.nb_valides,         color: 'text-gray-900' },
            { label: 'En attente',             value: stats.nb_en_attente,      color: 'text-yellow-500' },
            { label: 'Rejetés',                value: stats.nb_rejetes,         color: 'text-red-500' },
          ].map(s => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{s.label}</p>
              <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Navigation semaine */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <button onClick={semainePrec}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <div className="text-center">
              <p className="font-bold text-gray-900">
                {formatSemaine(lundiSemaine)} — {formatSemaine(dimanche)}
              </p>
              {estSemaineActuelle && (
                <span className="text-xs bg-primary-100 text-primary-700 font-semibold px-2 py-0.5 rounded-full">
                  Semaine actuelle
                </span>
              )}
            </div>
            <button onClick={semaineSuiv}
              disabled={estSemaineMaxFutur}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>
        </Card>

        {/* Grille des créneaux */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(slotsByJour).length === 0 ? (
          <Card className="p-10 text-center text-gray-400">
            <Clock size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Aucun créneau dans votre emploi du temps</p>
            <p className="text-sm mt-1">Contactez l'administrateur pour configurer votre emploi du temps</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(slotsByJour).map(([jour, joursSlots]) => {
              const dateDuJour = getDateCreneau(parseInt(jour))
              return (
                <Card key={jour} className="p-0 overflow-hidden">
                  <div className="bg-gray-50 px-5 py-3 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900">{JOURS[jour]}</h2>
                    <span className="text-xs text-gray-400">
                      {new Date(dateDuJour + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {joursSlots.map(slot => {
                      const session = getSession(slot)
                      const isLoading = saving === slot.id
                      const isFuture = dateDuJour > toISO(new Date())

                      return (
                        <div key={slot.id} className="px-5 py-4 flex items-center gap-4">
                          {/* Heure */}
                          <div className="w-20 shrink-0 text-center">
                            <p className="font-bold text-gray-900 text-sm">{slot.heure_debut?.slice(0, 5)}</p>
                            <p className="text-xs text-gray-400">{slot.heure_fin?.slice(0, 5)}</p>
                            <p className="text-xs text-primary-600 font-medium mt-0.5">
                              {formatDuree(dureeMinutes(slot.heure_debut, slot.heure_fin))}
                            </p>
                          </div>

                          {/* Infos cours */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">{slot.subjects?.nom}</p>
                            <p className="text-sm text-gray-500">{slot.classes?.nom}</p>
                            {session?.sujet_traite && (
                              <p className="text-xs text-gray-400 italic mt-0.5">"{session.sujet_traite}"</p>
                            )}
                            {session?.statut === 'absent' && session?.motif_absence && (
                              <p className="text-xs text-orange-500 mt-0.5">Absent : {session.motif_absence}</p>
                            )}
                            {session?.statut === 'rejete' && session?.motif_rejet && (
                              <p className="text-xs text-red-500 mt-0.5">Rejeté : {session.motif_rejet}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {session ? (
                              <>
                                <Badge color={
                                  session.statut === 'valide'  ? 'green'  :
                                  session.statut === 'rejete'  ? 'red'    :
                                  session.statut === 'absent'  ? 'yellow' : 'yellow'
                                }>
                                  {session.statut === 'absent' ? 'Absent' : STATUT_LABELS[session.statut]}
                                </Badge>
                                {/* Annuler seulement si pas encore validé */}
                                {session.statut === 'effectue' && (
                                  <button
                                    onClick={() => annulerDeclaration(session.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Annuler la déclaration"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                )}
                              </>
                            ) : isFuture && dateDuJour > toISO(lundiProchain) ? (
                              <span className="text-xs text-gray-300 italic">Trop loin</span>
                            ) : isFuture ? (
                              // Semaine prochaine : peut décliner à l'avance
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={isLoading}
                                onClick={() => { setAbsenceModal(slot); setMotif('') }}
                              >
                                <XCircle size={14} />
                                Décliner
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="success"
                                  loading={isLoading}
                                  onClick={() => { setSujetModal(slot); setSujet('') }}
                                >
                                  <CheckCircle size={14} />
                                  Effectué
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={isLoading}
                                  onClick={() => { setAbsenceModal(slot); setMotif('') }}
                                >
                                  <XCircle size={14} />
                                  Absent
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal sujet du cours ── */}
      <Modal isOpen={!!sujetModal} onClose={() => setSujetModal(null)} title="Cours effectué">
        {sujetModal && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
              <p className="font-semibold text-green-800">
                {sujetModal.subjects?.nom} — {sujetModal.classes?.nom}
              </p>
              <p className="text-green-600 text-xs mt-0.5">
                {sujetModal.heure_debut?.slice(0, 5)} → {sujetModal.heure_fin?.slice(0, 5)}
                {' · '}{formatDuree(dureeMinutes(sujetModal.heure_debut, sujetModal.heure_fin))}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sujet traité <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                rows={3}
                placeholder="ex: Introduction aux fractions — exercices corrigés"
                value={sujet}
                onChange={e => setSujet(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setSujetModal(null)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={() => marquerEffectue(sujetModal, sujet)}>
                <CheckCircle size={15} />
                Confirmer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal absence ── */}
      <Modal isOpen={!!absenceModal} onClose={() => setAbsenceModal(null)} title="Déclarer une absence">
        {absenceModal && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2 text-sm">
              <AlertCircle size={16} className="text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-orange-800">
                  {absenceModal.subjects?.nom} — {absenceModal.classes?.nom}
                </p>
                <p className="text-orange-600 text-xs mt-0.5">
                  {JOURS[absenceModal.jour_semaine]} · {absenceModal.heure_debut?.slice(0, 5)} → {absenceModal.heure_fin?.slice(0, 5)}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motif de l'absence *</label>
              <textarea
                rows={3}
                placeholder="ex: Maladie, convocation administrative, formation..."
                value={motif}
                onChange={e => setMotif(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            {/* Toggle notification élèves */}
            <button
              onClick={() => setNotifier(!notifier)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                ${notifier ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white'}`}
            >
              <div className={`w-10 h-6 rounded-full transition-all relative shrink-0
                ${notifier ? 'bg-primary-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all
                  ${notifier ? 'left-5' : 'left-1'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Notifier les élèves</p>
                <p className="text-xs text-gray-500">
                  {notifier
                    ? "Un bandeau s'affichera sur le dashboard élève/parent"
                    : "Les élèves ne seront pas informés"}
                </p>
              </div>
            </button>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setAbsenceModal(null)}>
                Annuler
              </Button>
              <Button variant="danger" className="flex-1" onClick={declarerAbsence}>
                <XCircle size={15} />
                Déclarer l'absence
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
