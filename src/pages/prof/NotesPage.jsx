import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Select, Badge, EmptyState } from '../../components/ui'
import { formatNote } from '../../utils/calculs'
import { FileText, Send, Save, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

// Colonnes disponibles
const COLONNES = [
  { field: 'devoir_1',    label: 'Devoir 1' },
  { field: 'devoir_2',    label: 'Devoir 2' },
  { field: 'devoir_3',    label: 'Devoir 3' },
  { field: 'composition', label: 'Composition' },
]

function calculerMoyenne(g) {
  const devoirs = [g.devoir_1, g.devoir_2, g.devoir_3]
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number)
  const mDev  = devoirs.length > 0 ? devoirs.reduce((a, b) => a + b, 0) / devoirs.length : null
  const compo = (g.composition !== null && g.composition !== undefined && g.composition !== '')
                ? Number(g.composition) : null
  if (mDev === null && compo === null) return null
  if (mDev === null) return compo
  if (compo === null) return mDev
  return (mDev + compo) / 2
}

export default function ProfNotes() {
  const { profile, schoolId } = useAuth()
  const [classes, setClasses]     = useState([])
  const [matieres, setMatieres]   = useState([])
  const [eleves, setEleves]       = useState([])
  const [grades, setGrades]       = useState({})
  const [selectedClasse, setSelectedClasse]       = useState('')
  const [selectedMatiere, setSelectedMatiere]     = useState('')
  const [selectedTrimestre, setSelectedTrimestre] = useState('1')
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)

  // Colonne active (celle que le prof est en train de saisir)
  const [colonneActive, setColonneActive] = useState('devoir_1')
  // Colonnes déjà soumises (verrouillées)
  const [colonnesSoumises, setColonnesSoumises] = useState([]) // ex: ['devoir_1']

  useEffect(() => { fetchClasses() }, [])
  useEffect(() => { if (selectedClasse) { fetchMatieres(); fetchEleves() } }, [selectedClasse])
  useEffect(() => {
    if (selectedClasse && selectedMatiere) { fetchEleves(); fetchGrades() }
  }, [selectedMatiere, selectedTrimestre])

  async function fetchClasses() {
    const { data } = await supabase
      .from('prof_classes')
      .select('classes(id, nom)')
      .eq('prof_id', profile.id)
    setClasses(data?.map(d => d.classes).filter(Boolean) || [])
  }

  async function fetchMatieres() {
    const { data } = await supabase
      .from('prof_classes')
      .select('subject_id, subjects(id, nom)')
      .eq('prof_id', profile.id)
      .eq('class_id', selectedClasse)
    if (!data?.length) { setMatieres([]); return }
    const subjectIds = data.map(d => d.subject_id).filter(Boolean)
    const { data: cs } = await supabase
      .from('class_subjects')
      .select('subject_id, coefficient')
      .eq('class_id', selectedClasse)
      .in('subject_id', subjectIds)
    const coefMap = {}
    cs?.forEach(c => { coefMap[c.subject_id] = c.coefficient })
    setMatieres(
      data.map(d => ({
        id:          d.subjects?.id,
        nom:         d.subjects?.nom,
        coefficient: coefMap[d.subject_id] ?? 1,
      })).filter(m => m.id)
    )
  }

  async function fetchEleves() {
    const { data: tousEleves } = await supabase
      .from('students')
      .select('id, prenom, nom')
      .eq('classe_id', selectedClasse)
      .order('nom')
    if (!tousEleves) { setEleves([]); return }

    if (selectedMatiere) {
      const { data: groupeSubject } = await supabase
        .from('group_subjects')
        .select('group_id')
        .eq('subject_id', selectedMatiere)
        .in('group_id',
          (await supabase
            .from('subject_option_groups')
            .select('id')
            .eq('class_id', selectedClasse)
          ).data?.map(g => g.id) || []
        )
        .limit(1)

      if (groupeSubject && groupeSubject.length > 0) {
        const groupId = groupeSubject[0].group_id
        const { data: optChoices } = await supabase
          .from('student_options')
          .select('student_id')
          .eq('group_id', groupId)
          .eq('subject_id', selectedMatiere)
          .eq('class_id', selectedClasse)
        const idChoisis = new Set((optChoices || []).map(o => o.student_id))
        setEleves(tousEleves.filter(e => idChoisis.has(e.id)))
      } else {
        setEleves(tousEleves)
      }
    } else {
      setEleves(tousEleves)
    }
  }

  async function fetchGrades() {
    setLoading(true)
    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('matiere_id', selectedMatiere)
      .eq('trimestre', selectedTrimestre)
      .in('student_id', eleves.map(e => e.id))

    const map = {}
    data?.forEach(g => { map[g.student_id] = g })
    setGrades(map)

    // Détecter les colonnes déjà soumises ou validées
    // Une colonne est soumise si tous les élèves qui ont une note dans cette colonne
    // ont un statut 'soumis' ou 'valide' pour cette colonne spécifiquement
    const soumises = []
    COLONNES.forEach(col => {
      const elevesAvecNote = (data || []).filter(g =>
        g[col.field] !== null && g[col.field] !== undefined
      )
      if (elevesAvecNote.length > 0) {
        const tousVerrouilles = elevesAvecNote.every(g =>
          g[`${col.field}_statut`] === 'soumis' || g[`${col.field}_statut`] === 'valide'
        )
        if (tousVerrouilles) soumises.push(col.field)
      }
    })
    setColonnesSoumises(soumises)

    // Choisir automatiquement la prochaine colonne non soumise
    const prochaineColonne = COLONNES.find(c => !soumises.includes(c.field))
    if (prochaineColonne) setColonneActive(prochaineColonne.field)

    setLoading(false)
  }

  function updateGrade(studentId, field, value) {
    // Validation stricte : la note ne peut pas dépasser 20 ni être négative
    if (value !== '') {
      let num = Number(value)
      if (isNaN(num)) return
      if (num > 20) {
        toast.error('La note ne peut pas dépasser 20')
        num = 20
      }
      if (num < 0) num = 0
      value = String(num)
    }
    setGrades(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], student_id: studentId, [field]: value }
    }))
  }

  function clamp20(v) {
    if (v === null || v === undefined || v === '') return null
    const n = Math.max(0, Math.min(20, Number(v)))
    return isNaN(n) ? null : n
  }

  // Sauvegarder uniquement la colonne active
  async function sauvegarderColonne(statut = 'brouillon') {
    if (!colonneActive) return
    setSaving(true)
    try {
      const upserts = eleves.map(eleve => {
        const g = grades[eleve.id] || {}
        return {
          student_id:  eleve.id,
          matiere_id:  selectedMatiere,
          prof_id:     profile.id,
          trimestre:   Number(selectedTrimestre),
          school_id:   schoolId,
          // On ne touche que la colonne active, les autres gardent leur valeur
          devoir_1:    clamp20(g.devoir_1),
          devoir_2:    clamp20(g.devoir_2),
          devoir_3:    clamp20(g.devoir_3),
          composition: clamp20(g.composition),
          // Statut par colonne uniquement
          [`${colonneActive}_statut`]: statut,
        }
      })

      const { error } = await supabase.from('grades').upsert(upserts, {
        onConflict: 'student_id,matiere_id,trimestre'
      })
      if (error) throw error

      if (statut === 'soumis') {
        toast.success(`${COLONNES.find(c => c.field === colonneActive)?.label} soumis pour validation !`)
        setColonnesSoumises(prev => [...new Set([...prev, colonneActive])])
        // Passer automatiquement à la prochaine colonne disponible
        const prochaine = COLONNES.find(c =>
          c.field !== colonneActive && !colonnesSoumises.includes(c.field)
        )
        if (prochaine) setColonneActive(prochaine.field)
      } else {
        toast.success('Brouillon sauvegardé')
      }
      fetchGrades()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const classeSelectionnee  = classes.find(c => c.id === selectedClasse)
  const matiereSelectionnee = matieres.find(m => m.id === selectedMatiere)
  const colonneActiveInfo   = COLONNES.find(c => c.field === colonneActive)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Saisie des notes</h1>
          <p className="text-gray-500 text-sm">Sélectionnez une classe, matière et trimestre</p>
        </div>

        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Classe" value={selectedClasse}
              onChange={e => { setSelectedClasse(e.target.value); setSelectedMatiere('') }}>
              <option value="">Choisir une classe</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </Select>
            <Select label="Matière" value={selectedMatiere}
              onChange={e => setSelectedMatiere(e.target.value)} disabled={!selectedClasse}>
              <option value="">Choisir une matière</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.nom} (Coef. {m.coefficient})</option>)}
            </Select>
            <Select label="Trimestre" value={selectedTrimestre}
              onChange={e => setSelectedTrimestre(e.target.value)}>
              <option value="1">1er Trimestre</option>
              <option value="2">2ème Trimestre</option>
              <option value="3">3ème Trimestre</option>
            </Select>
          </div>
        </Card>

        {selectedClasse && selectedMatiere && (
          <Card className="p-0 overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-bold text-gray-900">
                    {classeSelectionnee?.nom} — {matiereSelectionnee?.nom}
                  </h2>
                  <p className="text-sm text-gray-400">
                    Trimestre {selectedTrimestre} · {eleves.length} élève(s)
                  </p>
                </div>
              </div>

              {/* Sélecteur de colonne */}
              <div className="flex gap-2 flex-wrap mt-4">
                {COLONNES.map(col => {
                  const soumise   = colonnesSoumises.includes(col.field)
                  const isActive  = colonneActive === col.field
                  return (
                    <button
                      key={col.field}
                      onClick={() => !soumise && setColonneActive(col.field)}
                      disabled={soumise}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all
                        ${soumise
                          ? 'border-green-200 bg-green-50 text-green-600 cursor-not-allowed'
                          : isActive
                            ? 'border-primary-500 bg-primary-500 text-white shadow'
                            : 'border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600'}`}
                    >
                      {soumise
                        ? <><Lock size={11} /> {col.label} ✓</>
                        : col.label
                      }
                    </button>
                  )
                })}
              </div>

              {/* Boutons d'action pour la colonne active */}
              {colonneActiveInfo && !colonnesSoumises.includes(colonneActive) && (
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm" loading={saving}
                    onClick={() => sauvegarderColonne('brouillon')}>
                    <Save size={14} /> Sauvegarder {colonneActiveInfo.label}
                  </Button>
                  <Button size="sm" loading={saving}
                    onClick={() => sauvegarderColonne('soumis')}>
                    <Send size={14} /> Soumettre {colonneActiveInfo.label}
                  </Button>
                </div>
              )}

              {colonnesSoumises.length === COLONNES.length && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700 font-semibold flex items-center gap-2">
                  <Lock size={14} /> Toutes les notes ont été soumises pour validation
                </div>
              )}
            </div>

            {/* Tableau */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : eleves.length === 0 ? (
              <EmptyState icon={FileText} title="Aucun élève dans cette classe" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Élève</th>
                      {COLONNES.map(col => {
                        const soumise  = colonnesSoumises.includes(col.field)
                        const isActive = colonneActive === col.field
                        return (
                          <th key={col.field}
                            className={`px-3 py-3 text-center text-xs font-bold uppercase
                              ${soumise  ? 'text-green-500' :
                                isActive ? 'text-primary-600' : 'text-gray-400'}`}>
                            {col.label}
                            {soumise && <span className="ml-1">🔒</span>}
                            {isActive && !soumise && <span className="ml-1">✏️</span>}
                          </th>
                        )
                      })}
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Moyenne</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {eleves.map(eleve => {
                      const g   = grades[eleve.id] || {}
                      const moy = calculerMoyenne(g)
                      const statutsCol = COLONNES.map(col => g[`${col.field}_statut`] || 'brouillon')
                      const nbValide   = statutsCol.filter(s => s === 'valide').length
                      const nbSoumis   = statutsCol.filter(s => s === 'soumis').length
                      const nbSaisi    = COLONNES.filter(col => g[col.field] !== null && g[col.field] !== undefined && g[col.field] !== '').length
                      return (
                        <tr key={eleve.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {eleve.prenom} {eleve.nom}
                          </td>
                          {COLONNES.map(col => {
                            const soumise  = colonnesSoumises.includes(col.field)
                            const isActive = colonneActive === col.field
                            const statutCol = g[`${col.statutField || col.field + '_statut'}`]
                            const verrouille = soumise
                            return (
                              <td key={col.field} className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0" max="20" step="0.25"
                                  disabled={verrouille || !isActive}
                                  value={g[col.field] ?? ''}
                                  onChange={e => updateGrade(eleve.id, col.field, e.target.value)}
                                  className={`w-16 text-center px-2 py-1 border rounded-lg text-sm mx-auto block
                                    focus:outline-none focus:ring-2 focus:ring-primary-500
                                    ${verrouille
                                      ? 'bg-green-50 border-green-200 text-green-600 cursor-not-allowed'
                                      : isActive
                                        ? 'border-primary-300 bg-primary-50/50 focus:ring-primary-500'
                                        : 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'}`}
                                  placeholder="—"
                                />
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center">
                            <span className={`font-bold ${
                              moy !== null ? (moy >= 10 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'
                            }`}>
                              {moy !== null ? formatNote(moy) : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge color={nbValide === 4 ? 'green' : nbSoumis + nbValide > 0 ? 'yellow' : 'gray'}>
                              {nbValide === 4 ? 'Tout validé'
                               : nbSaisi === 0 ? 'Vide'
                               : `${nbValide}✓ ${nbSoumis}⏳ / ${nbSaisi}`}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
