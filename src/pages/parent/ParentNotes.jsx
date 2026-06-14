import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getMention, getAppreciation, formatNote } from '../../utils/calculs'
import { genererBulletin } from '../../utils/bulletin'
import { ChevronLeft, Star, Download } from 'lucide-react'
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
  const [downloading, setDownloading]       = useState(false)

  useEffect(() => { fetchNotes() }, [selectedTrimestre])

  async function fetchNotes() {
    setLoading(true)
    const token = getToken()
    if (!token) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_student_grades_by_token', {
      p_token: token,
      p_trimestre: parseInt(selectedTrimestre),
    })
    if (error) console.error(error)
    setNotes(data || [])
    setLoading(false)
  }

  async function telechargerBulletin() {
    setDownloading(true)
    try {
      await genererBulletin({
        eleve:    student,
        classe:   student?.classes,
        ecole:    student?.schools,
        notes,
        matieres: notes.map(n => ({ nom: n.matiere_nom, coefficient: n.coefficient })),
        trimestre: parseInt(selectedTrimestre),
        annee:    '2025/2026',
      })
      toast.success('Bulletin téléchargé !')
    } catch { toast.error('Erreur lors du téléchargement') }
    finally { setDownloading(false) }
  }

  const moyenneGenerale = notes.length > 0
    ? notes.reduce((acc, n) => acc + (n.moyenne_matiere || 0) * n.coefficient, 0) /
      notes.reduce((acc, n) => acc + n.coefficient, 0)
    : null

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
            <div className="space-y-2">
              {notes.map((note, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{note.matiere_nom}</p>
                      <p className="text-xs text-gray-400">Coeff. {note.coefficient}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-black ${
                        (note.moyenne_matiere || 0) >= 10 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {formatNote(note.moyenne_matiere)}
                        <span className="text-xs text-gray-400 font-normal">/20</span>
                      </p>
                      <p className="text-xs text-gray-400">{getAppreciation(note.moyenne_matiere)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    {note.note_devoir1 != null && (
                      <span className="bg-gray-100 px-2 py-0.5 rounded">D1 : {formatNote(note.note_devoir1)}</span>
                    )}
                    {note.note_devoir2 != null && (
                      <span className="bg-gray-100 px-2 py-0.5 rounded">D2 : {formatNote(note.note_devoir2)}</span>
                    )}
                    {note.note_composition != null && (
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                        Compo : {formatNote(note.note_composition)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bouton bulletin */}
            <button onClick={telechargerBulletin} disabled={downloading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-2xl
                         flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {downloading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Download size={16} />}
              Télécharger le bulletin T{selectedTrimestre}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
