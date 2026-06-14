import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  GraduationCap, BookOpen, Wallet, User, LogOut,
  CalendarDays, TrendingUp, AlertCircle, ChevronRight,
  Bell, XCircle
} from 'lucide-react'

export default function ParentDashboard() {
  const { studentId }          = useParams()
  const { parentSession, signOut } = useAuth()
  const [notes, setNotes]          = useState([])
  const [paiements, setPaiements]  = useState([])
  const [coursAnnules, setCoursAnnules] = useState([])  // cours annulés aujourd'hui
  const [loading, setLoading]      = useState(true)

  const student = parentSession?.student

  useEffect(() => {
    if (studentId && student) {
      fetchNotes()
      fetchPaiements()
      fetchCoursAnnules()
    }
  }, [studentId, student])

  // ── Notes depuis la table grades ────────────────────────
  async function fetchNotes() {
    const { data } = await supabase
      .from('grades')
      .select('*, subjects(nom)')
      .eq('student_id', studentId)
      .eq('statut', 'valide')
      .order('updated_at', { ascending: false })
      .limit(10)
    setNotes(data || [])
    setLoading(false)
  }

  // ── Paiements depuis la table student_payments ─────────
  async function fetchPaiements() {
    const { data } = await supabase
      .from('student_payments')
      .neq('statut', 'annule')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
    setPaiements(data || [])
  }

  // ── Cours annulés aujourd'hui pour la classe de l'élève ─
  async function fetchCoursAnnules() {
    if (!student?.classe_id) return
    const today = new Date().toISOString().slice(0, 10)

    const { data } = await supabase
      .from('course_sessions')
      .select('*, subjects:subject_id(nom), users:prof_id(prenom, nom)')
      .eq('classe_id', student.classe_id)
      .eq('date_cours', today)
      .eq('statut', 'absent')
      .eq('notifier_eleves', true)

    setCoursAnnules(data || [])
  }

  // ── Calculs ──────────────────────────────────────────────
  const moyenneGenerale = notes.length > 0
    ? (notes.reduce((acc, n) => acc + Number(n.moyenne_matiere || 0), 0) / notes.length).toFixed(2)
    : null

  const impayes = paiements.filter(p => p.statut === 'en_attente' || p.statut === 'partiel')

  if (!student) return null

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white px-5 pt-10 pb-16">
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap size={16} className="text-primary-200" />
              <span className="text-primary-200 text-sm">{student.schools?.name}</span>
            </div>
            <h1 className="text-2xl font-black">Bonjour, {student.prenom} !</h1>
            <p className="text-primary-200 text-sm mt-0.5">{student.classes?.nom}</p>
          </div>
          <button onClick={signOut} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-10 pb-24 space-y-4">

        {/* ── Bandeau cours annulés aujourd'hui ── */}
        {coursAnnules.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-100 border-b border-red-200">
              <Bell size={16} className="text-red-600 shrink-0" />
              <p className="text-sm font-bold text-red-800">
                {coursAnnules.length} cours annulé(s) aujourd'hui
              </p>
            </div>
            <div className="divide-y divide-red-100">
              {coursAnnules.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                  <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-900">
                      {c.subjects?.nom}
                      <span className="font-normal text-red-600 ml-1">
                        · {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                      </span>
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Prof. {c.users?.prenom} {c.users?.nom}
                      {c.motif_absence && ` · ${c.motif_absence}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Cartes stats ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
            <div className="text-3xl font-black text-primary-700">
              {moyenneGenerale ?? '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">Moyenne générale</div>
          </div>
          <div className={`rounded-2xl shadow-sm border p-4 text-center
            ${impayes.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
            <div className={`text-3xl font-black ${impayes.length > 0 ? 'text-orange-700' : 'text-green-600'}`}>
              {impayes.length > 0 ? impayes.length : '✓'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {impayes.length > 0 ? 'Paiement(s) en attente' : 'Paiements à jour'}
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { to: `/parent/${studentId}/notes`,       icon: BookOpen,     label: 'Mes Notes',      color: 'blue'   },
            { to: `/parent/${studentId}/paiements`,   icon: Wallet,       label: 'Paiements',      color: 'green'  },
            { to: `/parent/${studentId}/emploi`,      icon: CalendarDays, label: 'Emploi du temps',color: 'purple' },
            { to: `/parent/${studentId}/profil`,      icon: User,         label: 'Mon Profil',     color: 'gray'   },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={label} to={to}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3 hover:shadow-md hover:border-primary-200 transition-all group">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                ${color === 'blue'   ? 'bg-blue-100   group-hover:bg-blue-200'   : ''}
                ${color === 'green'  ? 'bg-green-100  group-hover:bg-green-200'  : ''}
                ${color === 'purple' ? 'bg-purple-100 group-hover:bg-purple-200' : ''}
                ${color === 'gray'   ? 'bg-gray-100   group-hover:bg-gray-200'   : ''}`}>
                <Icon size={22} className={`
                  ${color === 'blue'   ? 'text-blue-600'   : ''}
                  ${color === 'green'  ? 'text-green-600'  : ''}
                  ${color === 'purple' ? 'text-purple-600' : ''}
                  ${color === 'gray'   ? 'text-gray-600'   : ''}`} />
              </div>
              <span className="text-sm font-bold text-gray-700 group-hover:text-primary-700 transition-colors">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* ── Dernières notes ── */}
        {notes.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-50">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-primary-600" />
                Dernières notes
              </h2>
              <Link to={`/parent/${studentId}/notes`}
                className="text-xs text-primary-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                Tout voir <ChevronRight size={13} />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {notes.slice(0, 4).map(n => (
                <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{n.subjects?.nom}</div>
                    <div className="text-xs text-gray-400">Trimestre {n.trimestre}</div>
                  </div>
                  <div className={`text-lg font-black ${
                    Number(n.moyenne_matiere) >= 14 ? 'text-green-600'
                    : Number(n.moyenne_matiere) >= 10 ? 'text-blue-600'
                    : Number(n.moyenne_matiere) >= 8  ? 'text-orange-500'
                    : 'text-red-600'
                  }`}>
                    {Number(n.moyenne_matiere).toFixed(2)}
                    <span className="text-xs text-gray-400 font-normal">/20</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerte paiements ── */}
        {impayes.length > 0 && (
          <Link to={`/parent/${studentId}/paiements`}
            className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl hover:bg-orange-100 transition-colors">
            <AlertCircle size={20} className="text-orange-600 shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-orange-900 text-sm">Paiement(s) en attente</div>
              <div className="text-xs text-orange-700">
                {impayes.length} paiement(s) non soldé(s) · Appuyez pour voir les détails
              </div>
            </div>
            <ChevronRight size={16} className="text-orange-500" />
          </Link>
        )}

      </div>
    </div>
  )
}
