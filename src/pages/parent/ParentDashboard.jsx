import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  GraduationCap, BookOpen, Wallet, User, LogOut,
  CalendarDays, AlertCircle, ChevronRight,
  Bell, XCircle
} from 'lucide-react'

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token || null
  } catch { return null }
}

export default function ParentDashboard() {
  const { studentId }              = useParams()
  const { parentSession, signOut } = useAuth()
  const [paiements, setPaiements]  = useState([])
  const [coursAnnules, setCoursAnnules] = useState([])
  const [loading, setLoading]      = useState(true)

  const student = parentSession?.student

  useEffect(() => {
    if (studentId && student) {
      fetchPaiements()
      fetchCoursAnnules()
      setLoading(false)
    }
  }, [studentId, student])

  // ── Paiements via RPC sécurisée ─────────────────────────────
  async function fetchPaiements() {
    const token = getToken()
    if (!token) return

    const { data } = await supabase.rpc('get_student_payments_by_token', {
      p_token: token,
    })
    setPaiements(data || [])
  }

  // ── Cours annulés aujourd'hui via RPC sécurisée ─────────────
  async function fetchCoursAnnules() {
    const token = getToken()
    if (!token) return

    const { data } = await supabase.rpc('get_cours_annules_by_token', {
      p_token: token,
    })
    setCoursAnnules(data || [])
  }

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
                {coursAnnules.length} cours annulé(s)
              </p>
            </div>
            <div className="divide-y divide-red-100">
              {coursAnnules.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                  <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
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
                    <p className="text-xs text-red-600 mt-0.5">
                      Prof. {c.prof_nom}
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
          <Link to={`/parent/${studentId}/bulletin`}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center
                       hover:shadow-md hover:border-primary-200 transition-all group">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-2
                            group-hover:bg-primary-200 transition-colors">
              <BookOpen size={20} className="text-primary-600" />
            </div>
            <div className="text-sm font-bold text-gray-700 group-hover:text-primary-700 transition-colors">
              Bulletin
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Voir mes notes</div>
          </Link>
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
            { to: `/parent/${studentId}/notes`,     icon: BookOpen,     label: 'Mes Notes',       color: 'blue'   },
            { to: `/parent/${studentId}/paiements`, icon: Wallet,       label: 'Paiements',       color: 'green'  },
            { to: `/parent/${studentId}/emploi`,    icon: CalendarDays, label: 'Emploi du temps', color: 'purple' },
            { to: `/parent/${studentId}/profil`,    icon: User,         label: 'Mon Profil',      color: 'gray'   },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={label} to={to}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3
                         hover:shadow-md hover:border-primary-200 transition-all group">
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

        {/* ── Alerte paiements ── */}
        {impayes.length > 0 && (
          <Link to={`/parent/${studentId}/paiements`}
            className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl
                       hover:bg-orange-100 transition-colors">
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
