import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button } from '../../components/ui'
import {
  GraduationCap, AlertTriangle, CheckCircle,
  ChevronRight, ArrowRight, Users, Loader
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Table de progression des niveaux sénégalais ──────────────────────────
// Retourne le nom du niveau supérieur en conservant la série et la lettre
function getNiveauSuperieur(nomClasse) {
  if (!nomClasse) return null
  const nom = nomClasse.trim()

  // Terminale → sortant
  if (/^Tle?\b/i.test(nom)) return '__sortant__'

  // 3ème → sortant (BFEM)
  if (/^3.me\b/i.test(nom) || /^3ème\b/i.test(nom)) return '__sortant__'

  // Collège : 6ème→5ème, 5ème→4ème, 4ème→3ème
  const college = nom.match(/^(\d+)[eè]me?\s*(.*)/i)
  if (college) {
    const n = parseInt(college[1])
    const reste = college[2] // lettre groupe ex: "A", "B"
    if (n === 6) return `5ème ${reste}`.trim()
    if (n === 5) return `4ème ${reste}`.trim()
    if (n === 4) return `3ème ${reste}`.trim()
  }

  // 2nde → 1ère [même série+lettre]
  if (/^2nde?\b/i.test(nom)) {
    const reste = nom.replace(/^2nde?\s*/i, '')
    return `1ère ${reste}`.trim()
  }

  // 1ère [série] [lettre] → Tle [série] [lettre]
  if (/^1[eè]re?\b/i.test(nom)) {
    const reste = nom.replace(/^1[eè]re?\s*/i, '')
    return `Tle ${reste}`.trim()
  }

  return null
}

// ── Calcul moyenne annuelle (S1 + S2) / 2 ────────────────────────────────
function calculerMoyenneAnnuelle(moyS1, moyS2) {
  const valides = [moyS1, moyS2].filter(m => m !== null && m !== undefined)
  if (valides.length === 0) return null
  return valides.reduce((a, b) => a + b, 0) / valides.length
}

// ── Décision automatique selon la moyenne ────────────────────────────────
function decisionAuto(moyenne, niveauSup) {
  if (niveauSup === '__sortant__') return 'sortant'
  if (moyenne === null) return 'borderline' // pas assez de données
  if (moyenne >= 9.5) return 'promo'
  if (moyenne >= 8)   return 'borderline'
  return 'redouble'
}

const BADGE = {
  promo:      { label: '✅ Promu',      bg: 'bg-green-100',  text: 'text-green-800' },
  redouble:   { label: '🔄 Redouble',  bg: 'bg-orange-100', text: 'text-orange-800' },
  sortant:    { label: '🎓 Sortant',   bg: 'bg-purple-100', text: 'text-purple-800' },
  borderline: { label: '⚠️ À décider', bg: 'bg-yellow-100', text: 'text-yellow-800' },
}

export default function NouvelleAnneePage() {
  const { schoolId } = useAuth()
  const navigate = useNavigate()

  const [etape, setEtape]             = useState(1)  // 1=saisie, 2=tableau, 3=confirmation
  const [nouvelleAnnee, setNouvelleAnnee] = useState('')
  const [confirmText, setConfirmText]  = useState('')
  const [loading, setLoading]          = useState(false)
  const [applying, setApplying]        = useState(false)

  // Données chargées
  const [classes, setClasses]         = useState([])
  const [decisions, setDecisions]     = useState([]) // [{ eleve, moyS1, moyS2, moyAnn, action, nouvelle_classe_nom }]
  const [anneeActuelle, setAnneeActuelle] = useState('')

  // Stats
  const stats = {
    promus:     decisions.filter(d => d.action === 'promo').length,
    redoublants: decisions.filter(d => d.action === 'redouble').length,
    sortants:   decisions.filter(d => d.action === 'sortant').length,
    borderline: decisions.filter(d => d.action === 'borderline').length,
  }

  // ── Étape 1 → 2 : charger et analyser les élèves ─────────────────────
  async function analyserEleves() {
    if (!nouvelleAnnee.match(/^\d{4}\/\d{4}$/)) {
      toast.error('Format invalide. Utilisez : 2026/2027')
      return
    }
    setLoading(true)
    try {
      // Récupérer toutes les classes de l'année actuelle
      const { data: classesData } = await supabase
        .from('classes').select('*').eq('school_id', schoolId).order('nom')

      if (!classesData || classesData.length === 0) {
        toast.error('Aucune classe trouvée')
        return
      }

      // Déterminer l'année actuelle (la plus récente)
      const anneeActuelleVal = classesData
        .map(c => c.annee_scolaire)
        .filter(Boolean)
        .sort()
        .reverse()[0] || ''
      setAnneeActuelle(anneeActuelleVal)

      if (nouvelleAnnee === anneeActuelleVal) {
        toast.error(`L'année ${nouvelleAnnee} est déjà l'année active`)
        return
      }

      // Vérifier que la nouvelle année n'existe pas déjà
      const dejaExiste = classesData.some(c => c.annee_scolaire === nouvelleAnnee)
      if (dejaExiste) {
        toast.error(`L'année ${nouvelleAnnee} existe déjà en base`)
        return
      }

      setClasses(classesData)

      // Classes de l'année actuelle uniquement
      const classesActuelles = classesData.filter(c => c.annee_scolaire === anneeActuelleVal)
      const classIds = classesActuelles.map(c => c.id)

      // Récupérer tous les élèves de ces classes
      const { data: elevesData } = await supabase
        .from('students')
        .select('id, prenom, nom, classe_id')
        .in('classe_id', classIds)
        .order('nom')

      if (!elevesData || elevesData.length === 0) {
        toast.error('Aucun élève trouvé dans les classes actuelles')
        return
      }

      // Récupérer les moyennes validées par trimestre (S1=1, S2=2)
      // On utilise moyenne_matiere depuis grades pour calculer la moy générale
      const elevesIds = elevesData.map(e => e.id)

      const { data: gradesData } = await supabase
        .from('grades')
        .select('student_id, trimestre, moyenne_matiere, matiere_id, subjects:matiere_id(coefficient)')
        .in('student_id', elevesIds)
        .in('trimestre', [1, 2])
        .eq('statut', 'valide')

      // Calculer moy générale par élève par semestre
      const moyParEleveParSemestre = {}
      elevesData.forEach(e => { moyParEleveParSemestre[e.id] = { 1: null, 2: null } })

      // Grouper les grades par élève et semestre
      const grouped = {}
      gradesData?.forEach(g => {
        const coef = g.subjects?.coefficient || 1
        if (g.moyenne_matiere === null || g.moyenne_matiere === undefined) return
        if (!grouped[g.student_id]) grouped[g.student_id] = {}
        if (!grouped[g.student_id][g.trimestre]) grouped[g.student_id][g.trimestre] = { sum: 0, coefs: 0 }
        grouped[g.student_id][g.trimestre].sum   += g.moyenne_matiere * coef
        grouped[g.student_id][g.trimestre].coefs += coef
      })

      // Calculer les moyennes par semestre
      Object.entries(grouped).forEach(([eleveId, semestres]) => {
        Object.entries(semestres).forEach(([sem, data]) => {
          if (data.coefs > 0) {
            moyParEleveParSemestre[eleveId][Number(sem)] = data.sum / data.coefs
          }
        })
      })

      // Construire les décisions
      const nouvellesDecisions = elevesData.map(eleve => {
        const classeActuelle = classesActuelles.find(c => c.id === eleve.classe_id)
        const nomClasse      = classeActuelle?.nom || ''
        const niveauSup      = getNiveauSuperieur(nomClasse)

        const moyS1  = moyParEleveParSemestre[eleve.id]?.[1] ?? null
        const moyS2  = moyParEleveParSemestre[eleve.id]?.[2] ?? null
        const moyAnn = calculerMoyenneAnnuelle(moyS1, moyS2)

        const action = decisionAuto(moyAnn, niveauSup)

        // Classe cible
        let nouvelle_classe_nom = ''
        if (action === 'promo' && niveauSup && niveauSup !== '__sortant__') {
          nouvelle_classe_nom = niveauSup
        } else if (action === 'redouble') {
          nouvelle_classe_nom = nomClasse // même classe, nouvelle année
        } else if (action === 'borderline') {
          // Par défaut on propose la promotion, l'admin peut changer
          nouvelle_classe_nom = (niveauSup && niveauSup !== '__sortant__') ? niveauSup : nomClasse
        }

        return {
          eleve,
          classeActuelle: nomClasse,
          niveauSup,
          moyS1,
          moyS2,
          moyAnn,
          action,
          nouvelle_classe_nom,
        }
      })

      setDecisions(nouvellesDecisions)
      setEtape(2)
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Modifier une décision ────────────────────────────────────────────
  function changerDecision(idx, newAction) {
    setDecisions(prev => prev.map((d, i) => {
      if (i !== idx) return d
      let nouvelle_classe_nom = d.nouvelle_classe_nom
      if (newAction === 'promo' && d.niveauSup && d.niveauSup !== '__sortant__') {
        nouvelle_classe_nom = d.niveauSup
      } else if (newAction === 'redouble') {
        nouvelle_classe_nom = d.classeActuelle
      } else if (newAction === 'sortant') {
        nouvelle_classe_nom = ''
      }
      return { ...d, action: newAction, nouvelle_classe_nom }
    }))
  }

  // ── Étape 3 : Appliquer ──────────────────────────────────────────────
  async function appliquerNouvelleAnnee() {
    if (confirmText !== nouvelleAnnee) {
      toast.error('Le texte saisi ne correspond pas')
      return
    }
    setApplying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const payload = {
        nouvelle_annee: nouvelleAnnee,
        decisions: decisions.map(d => ({
          eleve_id:          d.eleve.id,
          action:            d.action,
          nouvelle_classe_nom: d.nouvelle_classe_nom,
        })),
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-new-year`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      )

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur serveur')

      const { eleves } = result
      toast.success(
        `✅ Année ${nouvelleAnnee} créée ! ${eleves.promus} promus · ${eleves.redoublants} redoublants · ${eleves.sortants} sortants`
      )

      if (result.erreurs?.length > 0) {
        console.warn('Erreurs partielles :', result.erreurs)
        toast.error(`${result.erreurs.length} élève(s) non transférés — voir la console`)
      }

      navigate('/admin/configuration')
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setApplying(false)
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/configuration')}
            className="text-gray-400 hover:text-gray-600 text-sm">
            ← Configuration
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <h1 className="text-xl font-black text-gray-900">Nouvelle année scolaire</h1>
        </div>

        {/* Indicateur d'étapes */}
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: 'Nouvelle année' },
            { n: 2, label: 'Promotions' },
            { n: 3, label: 'Confirmation' },
          ].map((s, i, arr) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all
                ${etape === s.n ? 'bg-primary-600 text-white' :
                  etape > s.n  ? 'bg-green-100 text-green-700' :
                                 'bg-gray-100 text-gray-400'}`}>
                {etape > s.n ? <CheckCircle size={14} /> : <span>{s.n}</span>}
                {s.label}
              </div>
              {i < arr.length - 1 && <ArrowRight size={14} className="text-gray-300" />}
            </div>
          ))}
        </div>

        {/* ══ ÉTAPE 1 : Saisie de la nouvelle année ══ */}
        {etape === 1 && (
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <GraduationCap size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Démarrer une nouvelle année</h2>
                <p className="text-sm text-gray-500">
                  Les classes, matières et affectations profs seront dupliquées automatiquement.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>Cette action est irréversible.</strong> Elle crée une nouvelle structure pour
                l'année saisie. L'ancienne année reste consultable en archive.
                Les professeurs verront uniquement leurs nouvelles classes.
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nouvelle année scolaire
              </label>
              <input
                value={nouvelleAnnee}
                onChange={e => setNouvelleAnnee(e.target.value)}
                placeholder="ex : 2026/2027"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-mono
                           focus:outline-none focus:border-primary-500 text-center tracking-widest"
              />
              <p className="text-xs text-gray-400 mt-1 text-center">Format : YYYY/YYYY</p>
            </div>

            <Button className="w-full" loading={loading} onClick={analyserEleves}>
              Analyser les élèves <ArrowRight size={16} />
            </Button>
          </Card>
        )}

        {/* ══ ÉTAPE 2 : Tableau des promotions ══ */}
        {etape === 2 && (
          <div className="space-y-4">
            {/* Stats rapides */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Promus',      val: stats.promus,     color: 'green'  },
                { label: 'Redoublants', val: stats.redoublants, color: 'orange' },
                { label: 'Sortants',    val: stats.sortants,   color: 'purple' },
                { label: 'À décider',   val: stats.borderline, color: 'yellow' },
              ].map(s => (
                <Card key={s.label} className="p-4 text-center">
                  <div className={`text-2xl font-black text-${s.color}-600`}>{s.val}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </Card>
              ))}
            </div>

            {/* Alerte si des cas sont à décider */}
            {stats.borderline > 0 && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <AlertTriangle size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <strong>{stats.borderline} élève(s)</strong> ont une moyenne entre 8 et 9.49 —
                  une décision manuelle est requise pour chacun.
                </div>
              </div>
            )}

            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Users size={16} className="text-primary-600" />
                  {decisions.length} élève(s) — {anneeActuelle} → {nouvelleAnnee}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Élève</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Classe actuelle</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Moy S1</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Moy S2</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Moy Ann.</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Décision</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Classe cible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {decisions.map((d, idx) => {
                      const badge = BADGE[d.action]
                      const moyColor = d.moyAnn === null ? 'text-gray-400'
                        : d.moyAnn >= 9.5 ? 'text-green-600'
                        : d.moyAnn >= 8   ? 'text-yellow-600'
                        : 'text-red-500'

                      return (
                        <tr key={d.eleve.id}
                          className={`hover:bg-gray-50/50 ${d.action === 'borderline' ? 'bg-yellow-50/40' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {d.eleve.prenom} {d.eleve.nom}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{d.classeActuelle}</td>
                          <td className="px-3 py-2 text-center text-gray-500 text-xs">
                            {d.moyS1 !== null ? d.moyS1.toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500 text-xs">
                            {d.moyS2 !== null ? d.moyS2.toFixed(2) : '—'}
                          </td>
                          <td className={`px-3 py-2 text-center font-bold text-sm ${moyColor}`}>
                            {d.moyAnn !== null ? d.moyAnn.toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <select
                              value={d.action}
                              onChange={e => changerDecision(idx, e.target.value)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer
                                ${badge.bg} ${badge.text} focus:outline-none focus:ring-2 focus:ring-primary-400`}
                            >
                              {d.niveauSup && d.niveauSup !== '__sortant__' && (
                                <option value="promo">✅ Promu</option>
                              )}
                              <option value="redouble">🔄 Redouble</option>
                              <option value="sortant">🎓 Sortant</option>
                              {d.moyAnn !== null && d.moyAnn >= 8 && d.moyAnn < 9.5 && (
                                <option value="borderline">⚠️ À décider</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500 font-mono">
                            {d.action === 'sortant' ? '—' : d.nouvelle_classe_nom || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setEtape(1)}>← Retour</Button>
              <Button
                disabled={stats.borderline > 0}
                onClick={() => setEtape(3)}
                title={stats.borderline > 0 ? 'Résolvez tous les cas "À décider" avant de continuer' : ''}>
                Continuer → Confirmation
              </Button>
            </div>
            {stats.borderline > 0 && (
              <p className="text-xs text-yellow-700 text-right">
                Résolvez d'abord les {stats.borderline} cas "À décider" avant de continuer.
              </p>
            )}
          </div>
        )}

        {/* ══ ÉTAPE 3 : Confirmation finale ══ */}
        {etape === 3 && (
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Confirmation finale</h2>
                <p className="text-sm text-gray-500">Cette action va modifier la base de données.</p>
              </div>
            </div>

            {/* Récapitulatif */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Nouvelle année créée</span>
                <span className="font-bold text-gray-900">{nouvelleAnnee}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Classes dupliquées</span>
                <span className="font-semibold">{classes.filter(c => {
                  const a = classes.map(x => x.annee_scolaire).filter(Boolean).sort().reverse()[0]
                  return c.annee_scolaire === a
                }).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Élèves promus</span>
                <span className="font-semibold text-green-600">{stats.promus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Élèves redoublants</span>
                <span className="font-semibold text-orange-600">{stats.redoublants}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Élèves sortants</span>
                <span className="font-semibold text-purple-600">{stats.sortants}</span>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <strong>Action irréversible.</strong> Pour confirmer, tapez exactement{' '}
              <code className="bg-red-100 px-1 rounded font-mono">{nouvelleAnnee}</code> ci-dessous.
            </div>

            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={`Tapez ${nouvelleAnnee} pour confirmer`}
              className="w-full px-4 py-3 border-2 border-red-200 rounded-xl font-mono text-center
                         focus:outline-none focus:border-red-400 text-red-700"
            />

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setEtape(2)}>← Retour</Button>
              <Button
                loading={applying}
                disabled={confirmText !== nouvelleAnnee}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
                onClick={appliquerNouvelleAnnee}>
                🚀 Démarrer l'année {nouvelleAnnee}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
