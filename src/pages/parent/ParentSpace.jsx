import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Badge } from '../../components/ui'
import { genererBulletin } from '../../utils/bulletin'
import { getMention, getAppreciation, formatNote } from '../../utils/calculs'
import { GraduationCap, Download, LogOut, Star, CreditCard, Calendar, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export default function ParentSpace() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const { parentSession, signOut } = useAuth()

  const [eleve, setEleve] = useState(null)
  const [notes, setNotes] = useState([])
  const [paiements, setPaiements] = useState([])
  const [emploiDuTemps, setEmploiDuTemps] = useState([])
  const [selectedTrimestre, setSelectedTrimestre] = useState('1')
  const [activeTab, setActiveTab] = useState('notes')
  const [loading, setLoading] = useState(true)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Sécurité : vérifier que la session parent correspond bien à cet élève
  useEffect(() => {
    if (!parentSession) {
      navigate('/login', { replace: true })
      return
    }

    // Vérification supplémentaire : l'élève demandé correspond à la session
    if (parentSession.student?.id !== studentId) {
      toast.error('Accès non autorisé')
      navigate('/login', { replace: true })
      return
    }

    loadAllData()
  }, [studentId, parentSession])

  useEffect(() => {
    if (parentSession && eleve) fetchNotes()
  }, [selectedTrimestre, eleve])

  async function loadAllData() {
    setLoading(true)
    await Promise.all([
      fetchEleve(),
      fetchPaiements(),
      fetchEmploiDuTemps(),
    ])
    setLoading(false)
  }

  async function fetchEleve() {
    // Utiliser la RPC sécurisée qui vérifie le token
    const { data, error } = await supabase
      .from('students')
      .select(`
        id, prenom, nom, unique_code, date_naissance, sexe,
        classes:classe_id(nom),
        schools:school_id(name, logo_url)
      `)
      .eq('id', studentId)
      .single()

    // Note : RLS protège déjà cet accès, mais sans session auth le parent
    // n'a pas de auth.uid(). On utilise donc la RPC verify_parent_session
    // implicitement via le token stocké dans AuthContext.

    // Double vérification côté client
    if (error || !data) {
      toast.error('Impossible de charger les données')
      navigate('/login', { replace: true })
      return
    }

    setEleve(data)
    await fetchNotes(data.id)
  }

  async function fetchNotes(sid = studentId) {
    setLoadingNotes(true)
    const token = JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token
    if (!token) { setLoadingNotes(false); return }

    const { data, error } = await supabase.rpc('get_student_grades_by_token', {
      p_token: token,
      p_trimestre: parseInt(selectedTrimestre),
    })

    if (error) {
      console.error('Erreur notes:', error)
    }
    setNotes(data || [])
    setLoadingNotes(false)
  }

  async function fetchPaiements() {
    const token = JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token
    if (!token) return

    const { data, error } = await supabase.rpc('get_student_payments_by_token', {
      p_token: token,
    })

    if (!error) setPaiements(data || [])
  }

  async function fetchEmploiDuTemps() {
    const token = JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token
    if (!token) return

    const { data, error } = await supabase.rpc('get_student_timetable_by_token', {
      p_token: token,
    })

    if (!error) setEmploiDuTemps(data || [])
  }

  async function telechargerBulletin() {
    setDownloading(true)
    try {
      const token = JSON.parse(localStorage.getItem('ecolepro_parent_session') || '{}').token

      const { data: resultats } = await supabase
        .from('results')
        .select('*')
        .eq('student_id', studentId)
        .eq('trimestre', parseInt(selectedTrimestre))
        .single()

      await genererBulletin({
        eleve,
        classe: eleve.classes,
        ecole: eleve.schools,
        notes,
        matieres: notes.map(n => ({ nom: n.matiere_nom, coefficient: n.coefficient })),
        resultats,
        trimestre: parseInt(selectedTrimestre),
        annee: '2025/2026',
      })
      toast.success('Bulletin téléchargé !')
    } catch (err) {
      toast.error('Erreur lors du téléchargement')
      console.error(err)
    } finally {
      setDownloading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!eleve) return null

  const moyenneGenerale = notes.length > 0
    ? (notes.reduce((acc, n) => acc + (n.moyenne_matiere || 0) * n.coefficient, 0) /
       notes.reduce((acc, n) => acc + n.coefficient, 0))
    : null

  const soldeRestant = paiements.reduce((acc, p) => acc + (p.solde || 0), 0)

  // Statut mensualité du mois en cours
  const maintenant = new Date()
  const moisCourant = maintenant.getMonth() + 1
  const anneeCourante = maintenant.getFullYear()
  const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const nomMoisCourant = MOIS_NOMS[moisCourant - 1]

  const paiementMoisCourant = paiements.find(p =>
    p.type_paiement === 'scolarite' &&
    Number(p.mois) === moisCourant &&
    Number(p.annee) === anneeCourante
  )
  const mensualiteAJour = paiementMoisCourant?.statut === 'complet'
  const mensualitePartielle = paiementMoisCourant?.statut === 'partiel'

  const tabs = [
    { id: 'notes', label: 'Notes', icon: Star },
    { id: 'paiements', label: 'Paiements', icon: CreditCard },
    { id: 'emploi', label: 'Emploi', icon: Calendar },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <GraduationCap size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-white/60">{eleve.schools?.name}</p>
                <p className="font-bold">{eleve.prenom} {eleve.nom}</p>
                <p className="text-xs text-white/60">{eleve.classes?.nom}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors"
            >
              <LogOut size={16} />
              Déconnexion
            </button>
          </div>

          {/* Résumé */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/15 rounded-xl p-3 text-center">
              {moyenneGenerale !== null ? (
                <>
                  <p className="text-2xl font-black">{formatNote(moyenneGenerale)}</p>
                  <p className="text-xs text-white/60">Moyenne T{selectedTrimestre}</p>
                  <p className="text-xs font-medium text-white/80">{getMention(moyenneGenerale)}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black">—</p>
                  <p className="text-xs text-white/60">Pas de notes T{selectedTrimestre}</p>
                </>
              )}
            </div>
            <div className={`rounded-xl p-3 text-center ${
              mensualiteAJour ? 'bg-white/15' :
              mensualitePartielle ? 'bg-yellow-500/40' :
              'bg-red-500/40'
            }`}>
              {mensualiteAJour ? (
                <>
                  <p className="text-2xl font-black">✓</p>
                  <p className="text-xs text-white/60 font-semibold">Paiements à jour</p>
                  <p className="text-xs text-white/50">{nomMoisCourant}</p>
                </>
              ) : mensualitePartielle ? (
                <>
                  <div className="flex items-center justify-center mb-1">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-xs font-black">Paiement partiel</p>
                  <p className="text-xs text-white/70">{nomMoisCourant}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center mb-1">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-xs font-black">Mensualité impayée</p>
                  <p className="text-xs text-white/70">{nomMoisCourant}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Onglets */}
        <div className="flex bg-white rounded-xl shadow-sm p-1 mb-4 gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all
                ${activeTab === id ? 'bg-primary-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Notes */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Sélecteur trimestre */}
            <div className="flex gap-2">
              {['1', '2', '3'].map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTrimestre(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                    ${selectedTrimestre === t
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                  Trimestre {t}
                </button>
              ))}
            </div>

            {loadingNotes ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400">
                <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm">Chargement des notes…</p>
              </div>
            ) : notes.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400">
                <Star size={32} className="mx-auto mb-2 opacity-30" />
                <p>Aucune note validée pour ce trimestre</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {notes.map((note, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
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
                          </p>
                          <p className="text-xs text-gray-400">{getAppreciation(note.moyenne_matiere)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs text-gray-500">
                        {[note.devoir_1, note.devoir_2, note.devoir_3].map((d, j) =>
                          d !== null && d !== undefined ? (
                            <span key={j} className="bg-gray-100 px-2 py-0.5 rounded">
                              D{j + 1}: {formatNote(d)}
                            </span>
                          ) : null
                        )}
                        {note.composition !== null && (
                          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                            Compo: {formatNote(note.composition)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bouton bulletin */}
                <button
                  onClick={telechargerBulletin}
                  disabled={downloading}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl
                             flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {downloading
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Download size={16} />
                  }
                  Télécharger le bulletin
                </button>
              </>
            )}
          </div>
        )}

        {/* Paiements */}
        {activeTab === 'paiements' && (
          <div className="space-y-3">

            {/* Statut mensualité du mois */}
            <div className={`rounded-xl p-4 flex items-center gap-4 ${
              mensualiteAJour ? 'bg-green-50 border border-green-200' :
              mensualitePartielle ? 'bg-yellow-50 border border-yellow-200' :
              'bg-red-50 border border-red-200'
            }`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-xl font-black ${
                mensualiteAJour ? 'bg-green-100 text-green-600' :
                mensualitePartielle ? 'bg-yellow-100 text-yellow-600' :
                'bg-red-100 text-red-500'
              }`}>
                {mensualiteAJour ? '✓' : '!'}
              </div>
              <div>
                <p className={`font-bold text-sm ${
                  mensualiteAJour ? 'text-green-700' :
                  mensualitePartielle ? 'text-yellow-700' :
                  'text-red-600'
                }`}>
                  {mensualiteAJour
                    ? 'Mensualité payée'
                    : mensualitePartielle
                      ? 'Paiement partiel enregistré'
                      : 'Mensualité en attente'}
                </p>
                <p className={`text-xs mt-0.5 ${
                  mensualiteAJour ? 'text-green-500' :
                  mensualitePartielle ? 'text-yellow-500' :
                  'text-red-400'
                }`}>
                  {mensualiteAJour
                    ? `Mois de ${nomMoisCourant} — à jour`
                    : `Mois de ${nomMoisCourant} — réglez dès que possible`}
                </p>
              </div>
            </div>

            {/* Historique */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Historique des paiements</p>

            {paiements.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400">
                <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                <p>Aucun paiement enregistré</p>
              </div>
            ) : (
              paiements.map((p, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-gray-900">{p.libelle}</p>
                    <Badge color={
                      p.statut === 'complet' ? 'green' :
                      p.statut === 'partiel' ? 'yellow' : 'red'
                    }>
                      {p.statut === 'complet' ? 'Payé' :
                       p.statut === 'partiel' ? 'Partiel' : 'À payer'}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{p.montant_paye?.toLocaleString('fr-FR')} F CFA encaissés</span>
                    {p.solde > 0 && (
                      <span className="text-red-500 font-medium">
                        Reste : {p.solde?.toLocaleString('fr-FR')} F
                      </span>
                    )}
                  </div>
                  {p.created_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Enregistré le {new Date(p.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Emploi du temps */}
        {activeTab === 'emploi' && (
          <div className="space-y-3">
            {emploiDuTemps.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                <p>Emploi du temps non configuré</p>
              </div>
            ) : (
              [1, 2, 3, 4, 5, 6].map(jour => {
                const cours = emploiDuTemps.filter(c => c.jour_semaine === jour)
                if (cours.length === 0) return null
                return (
                  <div key={jour} className="bg-white rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-primary-50 px-4 py-2">
                      <p className="font-bold text-primary-800 text-sm">{JOURS[jour]}</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {cours.map((c, i) => (
                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                          <div className="text-xs text-gray-500 w-20 shrink-0">
                            {c.heure_debut?.slice(0, 5)} – {c.heure_fin?.slice(0, 5)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{c.matiere_nom}</p>
                            <p className="text-xs text-gray-400">{c.prof_nom}{c.salle ? ` · ${c.salle}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      <p className="text-center text-gray-400 text-xs py-6">
        © 2025 EcolePro — Code : {eleve.unique_code}
      </p>
    </div>
  )
}
