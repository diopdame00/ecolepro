import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { ChevronLeft, CalendarDays, XCircle } from 'lucide-react'

const JOURS      = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOURS_COURT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function formatDuree(debut, fin) {
  if (!debut || !fin) return ''
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  const min = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (min <= 0) return ''
  return min >= 60 ? `${Math.floor(min / 60)}h${min % 60 || ''}` : `${min}min`
}

// Token stocké en localStorage par AuthContext
function getToken() {
  try {
    return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null
  } catch { return null }
}

export default function ParentEmploiDuTemps() {
  const { studentId }    = useParams()
  const { parentSession } = useAuth()
  const student           = parentSession?.student

  const [slots, setSlots]               = useState([])
  const [coursAnnules, setCoursAnnules] = useState([])
  const [loading, setLoading]           = useState(true)
  const [jourActif, setJourActif]       = useState(() => {
    const j = new Date().getDay()
    return j === 0 ? 1 : j
  })

  useEffect(() => {
    if (student?.classe_id) {
      fetchSlots()
      fetchCoursAnnules()
    }
  }, [student])

  // ── Emploi du temps via RPC sécurisée ──────────────────────
  async function fetchSlots() {
    setLoading(true)
    const token = getToken()
    if (!token) { setLoading(false); return }

    const { data, error } = await supabase.rpc('get_student_timetable_by_token', {
      p_token: token,
    })

    if (error) console.error('Emploi du temps:', error)
    // La RPC retourne : id, jour_semaine, heure_debut, heure_fin, salle, matiere_nom, prof_nom
    setSlots(data || [])
    setLoading(false)
  }

  // ── Cours annulés aujourd'hui via RPC sécurisée ────────────
  async function fetchCoursAnnules() {
    const token = getToken()
    if (!token) return

    const { data, error } = await supabase.rpc('get_cours_annules_by_token', {
      p_token: token,
    })

    if (error) console.error('Cours annulés:', error)
    setCoursAnnules(data || [])
  }

  const slotsJour      = slots.filter(s => s.jour_semaine === jourActif)
  const joursAvecCours = [...new Set(slots.map(s => s.jour_semaine))].sort()

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white px-5 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <Link to={`/parent/${studentId}`}
            className="flex items-center gap-1 text-primary-200 text-sm mb-4 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retour
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <CalendarDays size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black">Emploi du temps</h1>
              <p className="text-primary-200 text-sm">{student?.classes?.nom}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* Bandeau cours annulés aujourd'hui */}
        {coursAnnules.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-100 border-b border-red-200">
              <XCircle size={16} className="text-red-600 shrink-0" />
              <p className="text-sm font-bold text-red-800">
                {coursAnnules.length} cours annulé(s)
              </p>
            </div>
            {coursAnnules.map(c => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-red-900">
                    {c.matiere_nom}
                    <span className="font-normal text-red-600 ml-1">
                      · {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                    </span>
                  </p>
                  {c.date_cours && c.date_cours !== new Date().toISOString().slice(0, 10) && (
                    <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                      Demain
                    </span>
                  )}
                </div>
                <p className="text-xs text-red-500 mt-0.5">
                  Prof. {c.prof_nom}
                  {c.motif_absence && ` · "${c.motif_absence}"`}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Sélecteur jours */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map(j => {
              const aDesCours = joursAvecCours.includes(j)
              return (
                <button
                  key={j}
                  onClick={() => setJourActif(j)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                    ${jourActif === j
                      ? 'bg-primary-600 text-white shadow'
                      : aDesCours
                        ? 'text-gray-700 hover:bg-gray-100'
                        : 'text-gray-300'}`}
                >
                  <div>{JOURS_COURT[j]}</div>
                  {aDesCours && (
                    <div className={`w-1 h-1 rounded-full mx-auto mt-1
                      ${jourActif === j ? 'bg-white' : 'bg-primary-400'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Créneaux du jour */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slotsJour.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <CalendarDays size={36} className="mx-auto mb-3 text-gray-200" />
            <p className="font-semibold text-gray-400">Pas de cours ce jour</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-500 px-1">{JOURS[jourActif]}</p>
            {slotsJour.map(slot => {
              const estAnnule = coursAnnules.some(c =>
                c.heure_debut === slot.heure_debut &&
                c.jour_semaine === slot.jour_semaine
              )
              return (
                <div key={slot.id}
                  className={`bg-white rounded-2xl shadow-sm border p-4 flex gap-4
                    ${estAnnule ? 'border-red-200 opacity-75' : 'border-gray-100'}`}>

                  {/* Heure */}
                  <div className="shrink-0 text-center w-14">
                    <p className="font-black text-gray-900 text-sm">{slot.heure_debut?.slice(0, 5)}</p>
                    <div className="w-px h-4 bg-gray-200 mx-auto my-1" />
                    <p className="text-xs text-gray-400">{slot.heure_fin?.slice(0, 5)}</p>
                    <p className="text-xs text-primary-600 font-medium mt-1">
                      {formatDuree(slot.heure_debut, slot.heure_fin)}
                    </p>
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-bold text-base ${estAnnule ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {slot.matiere_nom}
                      </p>
                      {estAnnule && (
                        <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full shrink-0">
                          Annulé
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">Prof. {slot.prof_nom}</p>
                    {slot.salle && (
                      <p className="text-xs text-gray-400 mt-1">📍 {slot.salle}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
