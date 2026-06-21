import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getMention, formatNote } from '../../utils/calculs'
import { ChevronLeft, Star, Archive, BookOpen } from 'lucide-react'

function getToken() {
  try { return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null }
  catch { return null }
}

export default function ParentNotes() {
  const { studentId }     = useParams()
  const { parentSession } = useAuth()
  const student           = parentSession?.student

  const [notes, setNotes]             = useState([])
  const [selectedTrimestre, setTrimestre] = useState('1')
  const [loading, setLoading]         = useState(true)

  // ── Archives : toutes les années où l'élève a été inscrit ──
  const [anneesDispos, setAnneesDispos]           = useState([])
  const [anneeActive, setAnneeActive]             = useState(null)
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(null) // null = active

  const anneeAffichee = anneeSelectionnee ?? anneeActive
  const enModeArchive = anneeSelectionnee !== null && anneeSelectionnee !== anneeActive

  // Charger toutes les années d'inscription de l'élève
  useEffect(() => {
    if (studentId) fetchAnneesEleve()
  }, [studentId])

  // Recharger les notes quand le trimestre ou l'année change
  useEffect(() => {
    fetchNotes()
  }, [selectedTrimestre, anneeSelectionnee])

  async function fetchAnneesEleve() {
    // Récupérer toutes les années scolaires liées à cet élève via ses classes
    const { data } = await supabase
      .from('students')
      .select('annee_scolaire, classes(annee_scolaire)')
      .eq('id', studentId)
      .order('annee_scolaire', { ascending: false })

    if (data && data.length > 0) {
      // Collecter toutes les années distinctes (depuis la colonne ou via la classe)
      const annees = [...new Set(data.map(d =>
        d.annee_scolaire || d.classes?.annee_scolaire
      ).filter(Boolean))].sort((a, b) => b.localeCompare(a))

      setAnneesDispos(annees)
      setAnneeActive(annees[0] || null)
    }
  }

  async function fetchNotes() {
    setLoading(true)
    const token = getToken()
    if (!token) { setLoading(false); return }

    // La RPC retourne les notes de l'année active de l'élève
    // Pour les archives : on filtre côté client par annee si la RPC ne le supporte pas encore
    const { data, error } = await supabase.rpc('get_student_grades_by_token', {
      p_token:     token,
      p_trimestre: parseInt(selectedTrimestre),
    })
    if (error) console.error(error)
    setNotes(data || [])
    setLoading(false)
  }

  // Calcul moyenne générale simple
  function calculerMoyenne(notes) {
    const valides = notes.filter(n => n.devoir_1 !== null || n.composition !== null)
    if (valides.length === 0) return null
    const total = valides.reduce((acc, n) => {
      const devs = [n.devoir_1, n.devoir_2, n.devoir_3].filter(v => v != null).map(Number)
      const mDev = devs.length > 0 ? devs.reduce((a, b) => a + b, 0) / devs.length : null
      const comp = n.composition != null ? Number(n.composition) : null
      let moy = mDev === null ? comp : comp === null ? mDev : (mDev + comp) / 2
      if (moy === null) return acc
      return { sum: acc.sum + moy * (n.coefficient || 1), coef: acc.coef + (n.coefficient || 1) }
    }, { sum: 0, coef: 0 })
    return total.coef > 0 ? total.sum / total.coef : null
  }

  const moyenneGenerale = calculerMoyenne(notes)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className={`text-white px-5 pt-10 pb-6 ${enModeArchive
        ? 'bg-gradient-to-r from-amber-700 to-amber-600'
        : 'bg-gradient-to-r from-primary-700 to-primary-600'}`}>
        <div className="max-w-lg mx-auto">
          <Link to={`/parent/${studentId}`}
            className="flex items-center gap-1 text-white/70 text-sm mb-4 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retour
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                {enModeArchive ? <Archive size={20} /> : <Star size={20} />}
              </div>
              <div>
                <h1 className="text-xl font-black">Mes Notes</h1>
                <p className="text-white/70 text-sm">
                  {student?.classes?.nom}
                  {enModeArchive && <span className="ml-2 text-amber-200 font-bold">· Archive {anneeSelectionnee}</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Moyenne dans le header */}
          {moyenneGenerale !== null && (
            <div className="mt-4 bg-white/15 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-white/70">Moyenne T{selectedTrimestre}</span>
              <div className="text-right">
                <span className="text-2xl font-black">{formatNote(moyenneGenerale)}</span>
                <span className="text-xs text-white/60 ml-2">{getMention(moyenneGenerale)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">

        {/* ── Sélecteur d'année (archives) ── */}
        {anneesDispos.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={13} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Année scolaire</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {anneesDispos.map((a, idx) => {
                const isActif = anneeAffichee === a
                const estActive = a === anneeActive
                return (
                  <button key={a}
                    onClick={() => setAnneeSelectionnee(estActive ? null : a)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all
                      ${isActif
                        ? estActive
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                    {estActive ? <BookOpen size={10} /> : <Archive size={10} />}
                    {a}
                    {estActive && <span className="text-[9px] opacity-60">ACTIVE</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Sélecteur trimestre ── */}
        <div className="flex gap-2">
          {['1', '2', '3'].map(t => (
            <button key={t} onClick={() => setTrimestre(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                ${selectedTrimestre === t
                  ? enModeArchive
                    ? 'bg-amber-500 text-white shadow'
                    : 'bg-primary-600 text-white shadow'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}>
              Trimestre {t}
            </button>
          ))}
        </div>

        {/* ── Bandeau archive ── */}
        {enModeArchive && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 text-amber-800 text-sm">
              <Archive size={14} className="text-amber-500" />
              Consultation archive — <strong>{anneeSelectionnee}</strong>
            </div>
            <button onClick={() => setAnneeSelectionnee(null)}
              className="text-xs font-bold text-amber-700 underline hover:text-amber-900">
              ← Année active
            </button>
          </div>
        )}

        {/* ── Liste des notes ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <Star size={36} className="mx-auto mb-3 text-gray-200" />
            <p className="font-semibold text-gray-400">Aucune note validée pour ce trimestre</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div>
                    <p className="font-bold text-gray-900">{note.matiere_nom}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {note.prof_nom ? `Prof. ${note.prof_nom}` : 'Prof. non assigné'}
                      {note.coefficient ? ` · Coeff. ${note.coefficient}` : ''}
                    </p>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Devoir 1', value: note.devoir_1 },
                      { label: 'Devoir 2', value: note.devoir_2 },
                      { label: 'Devoir 3', value: note.devoir_3 },
                    ].map(({ label, value }) => (
                      <div key={label}
                        className={`flex flex-col items-center justify-center px-2 py-3 rounded-xl
                          ${value != null ? 'bg-gray-50 border border-gray-100' : 'bg-gray-50/40 border border-dashed border-gray-200'}`}>
                        <span className="text-xs font-medium text-gray-400 mb-1">{label}</span>
                        <span className={`text-lg font-black ${
                          value == null ? 'text-gray-300'
                          : value >= 14 ? 'text-green-600'
                          : value >= 10 ? 'text-blue-600'
                          : value >= 8  ? 'text-orange-500'
                          : 'text-red-500'}`}>
                          {value != null ? formatNote(value) : '—'}
                        </span>
                        {value != null && <span className="text-xs text-gray-300">/20</span>}
                      </div>
                    ))}
                  </div>
                  <div className={`flex items-center justify-between px-4 py-3 rounded-xl
                    ${note.composition != null ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50/40 border border-dashed border-gray-200'}`}>
                    <div>
                      <p className="text-sm font-semibold text-blue-700">Composition</p>
                      <p className="text-xs text-blue-400">Examen trimestriel</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black ${
                        note.composition == null ? 'text-gray-300'
                        : note.composition >= 14 ? 'text-green-600'
                        : note.composition >= 10 ? 'text-blue-600'
                        : note.composition >= 8  ? 'text-orange-500'
                        : 'text-red-500'}`}>
                        {note.composition != null ? formatNote(note.composition) : '—'}
                      </span>
                      {note.composition != null && <span className="text-xs text-gray-400 ml-1">/20</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
