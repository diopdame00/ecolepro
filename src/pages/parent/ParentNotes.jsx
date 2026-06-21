import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getMention, getAppreciation, formatNote } from '../../utils/calculs'
import { genererBulletin } from '../../utils/bulletin'
import { ChevronLeft, Star, Archive } from 'lucide-react'
import toast from 'react-hot-toast'

function getToken() {
  try { return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null }
  catch { return null }
}

export default function ParentNotes() {
  const { studentId }      = useParams()
  const { parentSession }  = useAuth()
  const student            = parentSession?.student

  const [notes, setNotes]                   = useState([])
  const [selectedTrimestre, setTrimestre]   = useState('1')
  const [loading, setLoading]               = useState(true)
  const [anneesDispos, setAnneesDispos]     = useState([])
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(null) // null = active

  useEffect(() => { fetchAnnees() }, [])
  useEffect(() => { fetchNotes() }, [selectedTrimestre, anneeSelectionnee])

  async function fetchAnnees() {
    const token = getToken()
    if (!token) return
    // Récupérer toutes les années où l'élève a des notes
    const { data } = await supabase.rpc('get_student_grades_by_token', {
      p_token: token, p_trimestre: 1,
    })
    // Pour les archives, on interroge la classe de l'élève
    const { data: classData } = await supabase
      .from('students')
      .select('classes(annee_scolaire)')
      .eq('id', studentId)
      .single()
    if (classData?.classes?.annee_scolaire) {
      // Pour simplifier : on lit toutes les années via les grades
      setAnneesDispos([classData.classes.annee_scolaire])
    }
  }

  async function fetchNotes() {
    setLoading(true)
    const token = getToken()
    if (!token) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_student_grades_by_token', {
      p_token: token,
      p_trimestre: parseInt(selectedTrimestre),
    })
    // TODO: filtrer par anneeSelectionnee quand la RPC le supportera
    if (error) console.error(error)
    setNotes(data || [])
    setLoading(false)
  }

  const moyenneGenerale = null // Calcul non applicable — affiché par l'admin uniquement

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
              <Star size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black">Mes Notes</h1>
              <p className="text-primary-200 text-sm">{student?.classes?.nom}</p>
            </div>
          </div>
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

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* Sélecteur d'année (archives) */}
        {anneesDispos.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Archive size={13} className="text-gray-400" />
            {anneesDispos.map(a => (
              <button key={a}
                onClick={() => setAnneeSelectionnee(a === anneesDispos[0] ? null : a)}
                className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all
                  ${(anneeSelectionnee === a || (anneeSelectionnee === null && a === anneesDispos[0]))
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-400 hover:border-primary-300'}`}>
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Sélecteur trimestre */}
        <div className="flex gap-2">
          {['1', '2', '3'].map(t => (
            <button key={t} onClick={() => setTrimestre(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                ${selectedTrimestre === t
                  ? 'bg-primary-600 text-white shadow'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}>
              Trimestre {t}
            </button>
          ))}
        </div>

        {/* Liste des notes */}
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
          <>
            <div className="space-y-3">
              {notes.map((note, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* En-tête matière */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div>
                      <p className="font-bold text-gray-900">{note.matiere_nom}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {note.prof_nom ? `Prof. ${note.prof_nom}` : 'Prof. non assigné'}
                        {note.coefficient ? ` · Coeff. ${note.coefficient}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Détail des notes — devoirs + composition */}
                  <div className="px-4 py-3 space-y-2">
                    {/* Devoirs en grille 3 colonnes */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Devoir 1', value: note.devoir_1 },
                        { label: 'Devoir 2', value: note.devoir_2 },
                        { label: 'Devoir 3', value: note.devoir_3 },
                      ].map(({ label, value }) => (
                        <div key={label}
                          className={`flex flex-col items-center justify-center px-2 py-3 rounded-xl
                            ${value != null
                              ? 'bg-gray-50 border border-gray-100'
                              : 'bg-gray-50/40 border border-dashed border-gray-200'}`}>
                          <span className="text-xs font-medium text-gray-400 mb-1">{label}</span>
                          <span className={`text-lg font-black ${
                            value == null  ? 'text-gray-300'
                            : value >= 14  ? 'text-green-600'
                            : value >= 10  ? 'text-blue-600'
                            : value >= 8   ? 'text-orange-500'
                            : 'text-red-500'
                          }`}>
                            {value != null ? formatNote(value) : '—'}
                          </span>
                          {value != null && (
                            <span className="text-xs text-gray-300">/20</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Composition — pleine largeur, style distinct */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl
                      ${note.composition != null
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50/40 border border-dashed border-gray-200'}`}>
                      <div>
                        <p className="text-sm font-semibold text-blue-700">Composition</p>
                        <p className="text-xs text-blue-400">Examen trimestriel</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-black ${
                          note.composition == null  ? 'text-gray-300'
                          : note.composition >= 14  ? 'text-green-600'
                          : note.composition >= 10  ? 'text-blue-600'
                          : note.composition >= 8   ? 'text-orange-500'
                          : 'text-red-500'
                        }`}>
                          {note.composition != null ? formatNote(note.composition) : '—'}
                        </span>
                        {note.composition != null && (
                          <span className="text-xs text-gray-400 ml-1">/20</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
