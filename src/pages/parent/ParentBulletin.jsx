import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { genererBulletin } from '../../utils/bulletin'
import { ChevronLeft, FileText, Download, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

function getToken() {
  try { return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null }
  catch { return null }
}

export default function ParentBulletin() {
  const { studentId }     = useParams()
  const { parentSession } = useAuth()
  const student           = parentSession?.student

  const [notes, setNotes]           = useState([])
  const [selectedTrimestre, setTrimestre] = useState('1')
  const [loading, setLoading]       = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { fetchNotes() }, [selectedTrimestre])

  async function fetchNotes() {
    setLoading(true)
    const token = getToken()
    if (!token) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_student_grades_by_token', {
      p_token:     token,
      p_trimestre: parseInt(selectedTrimestre),
    })
    if (error) console.error(error)
    setNotes(data || [])
    setLoading(false)
  }

  // Bulletin disponible si toutes les matières ont au moins une note (devoir ou compo)
  const bulletinDisponible = notes.length > 0 && notes.every(n =>
    n.devoir_1 != null || n.devoir_2 != null || n.devoir_3 != null || n.composition != null
  )

  async function telechargerBulletin() {
    if (!bulletinDisponible) return
    setDownloading(true)
    try {
      await genererBulletin({
        eleve:     student,
        classe:    student?.classes,
        ecole:     student?.schools,
        notes,
        matieres:  notes.map(n => ({ nom: n.matiere_nom, coefficient: n.coefficient })),
        trimestre: parseInt(selectedTrimestre),
        annee:     '2025/2026',
      })
      toast.success('Bulletin téléchargé !')
    } catch {
      toast.error('Erreur lors du téléchargement')
    } finally {
      setDownloading(false)
    }
  }

  if (!student) return null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white px-5 pt-10 pb-8">
        <div className="max-w-lg mx-auto">
          <Link to={`/parent/${studentId}`}
            className="flex items-center gap-1 text-primary-200 text-sm mb-4 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retour
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black">Bulletin</h1>
              <p className="text-primary-200 text-sm">{student?.classes?.nom}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

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

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          /* Aucune note du tout */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <FileText size={24} className="text-gray-300" />
            </div>
            <p className="font-semibold text-gray-400">Aucune note pour ce trimestre</p>
            <p className="text-xs text-gray-300 mt-1">Les notes apparaîtront une fois saisies et validées</p>
          </div>
        ) : (
          <>
            {/* Récapitulatif matières */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Matières du trimestre {selectedTrimestre}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {notes.map((n, i) => {
                  const aNoteDevoir = n.devoir_1 != null || n.devoir_2 != null || n.devoir_3 != null
                  const aNoteCompo  = n.composition != null
                  const complete    = aNoteDevoir || aNoteCompo
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{n.matiere_nom}</p>
                        <p className="text-xs text-gray-400">{n.prof_nom || 'Prof. non assigné'}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                        ${complete
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-600'}`}>
                        {complete ? 'Notée' : 'En attente'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bouton téléchargement — conditionnel */}
            {bulletinDisponible ? (
              <button
                onClick={telechargerBulletin}
                disabled={downloading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-2xl
                           flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-sm">
                {downloading
                  ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Download size={18} />}
                Télécharger le bulletin T{selectedTrimestre}
              </button>
            ) : (
              <div className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-5 px-4
                             flex flex-col items-center justify-center gap-2 text-center">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-1">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <p className="font-bold text-gray-500">Bulletin non disponible</p>
                <p className="text-xs text-gray-400 max-w-xs">
                  Toutes les matières doivent avoir au moins une note pour pouvoir télécharger le bulletin.
                </p>
                <div className="mt-2 text-xs text-orange-500 font-medium">
                  {notes.filter(n =>
                    n.devoir_1 == null && n.devoir_2 == null &&
                    n.devoir_3 == null && n.composition == null
                  ).length} matière(s) sans note
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
