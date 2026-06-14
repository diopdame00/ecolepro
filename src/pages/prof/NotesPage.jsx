import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Select, Badge, EmptyState } from '../../components/ui'
import { calculerMoyenneMatiere, formatNote } from '../../utils/calculs'
import { FileText, Send, Save, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProfNotes() {
  const { profile, schoolId } = useAuth()
  const [classes, setClasses] = useState([])
  const [matieres, setMatieres] = useState([])
  const [eleves, setEleves] = useState([])
  const [grades, setGrades] = useState({})
  const [selectedClasse, setSelectedClasse] = useState('')
  const [selectedMatiere, setSelectedMatiere] = useState('')
  const [selectedTrimestre, setSelectedTrimestre] = useState('1')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchClasses() }, [])
  useEffect(() => { if (selectedClasse) { fetchMatieres(); fetchEleves() } }, [selectedClasse])
  useEffect(() => { if (selectedClasse && selectedMatiere) fetchGrades() }, [selectedClasse, selectedMatiere, selectedTrimestre])

  async function fetchClasses() {
    const { data } = await supabase
      .from('prof_classes')
      .select('classes(id, nom)')
      .eq('prof_id', profile.id)
    setClasses(data?.map(d => d.classes) || [])
  }

  async function fetchMatieres() {
    // Récupère les matières du prof pour cette classe
    const { data } = await supabase
      .from('prof_classes')
      .select('subject_id, subjects(id, nom)')
      .eq('prof_id', profile.id)
      .eq('class_id', selectedClasse)

    if (!data?.length) { setMatieres([]); return }

    const subjectIds = data.map(d => d.subject_id).filter(Boolean)

    // Coefficients configurés par l'admin dans class_subjects (par classe)
    const { data: cs } = await supabase
      .from('class_subjects')
      .select('subject_id, coefficient')
      .eq('class_id', selectedClasse)
      .in('subject_id', subjectIds)

    const coefMap = {}
    cs?.forEach(c => { coefMap[c.subject_id] = c.coefficient })

    setMatieres(
      data
        .map(d => ({
          id: d.subjects?.id,
          nom: d.subjects?.nom,
          coefficient: coefMap[d.subject_id] ?? 1,
        }))
        .filter(m => m.id)
    )
  }

  async function fetchEleves() {
    const { data } = await supabase
      .from('students')
      .select('id, prenom, nom')
      .eq('classe_id', selectedClasse)
      .order('nom')
    setEleves(data || [])
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
    setLoading(false)
  }

  function updateGrade(studentId, field, value) {
    setGrades(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], student_id: studentId, [field]: value }
    }))
  }

  async function sauvegarder(statut = 'brouillon') {
    setSaving(true)
    try {
      const upserts = eleves.map(eleve => {
        const g = grades[eleve.id] || {}

        return {
          student_id: eleve.id,
          matiere_id: selectedMatiere,
          prof_id: profile.id,
          trimestre: Number(selectedTrimestre),
          school_id: schoolId,
          devoir_1: g.devoir_1 || null,
          devoir_2: g.devoir_2 || null,
          devoir_3: g.devoir_3 || null,
          composition: g.composition || null,
          // moyenne_matiere et moyenne_devoirs sont recalculées automatiquement
          // côté base par le trigger calculate_grade_averages
          statut: statut,
        }
      })

      const { error } = await supabase.from('grades').upsert(upserts, {
        onConflict: 'student_id,matiere_id,trimestre'
      })

      if (error) throw error
      toast.success(statut === 'soumis' ? 'Notes soumises pour validation !' : 'Brouillon sauvegardé')
      fetchGrades()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const classeSelectionnee = classes.find(c => c.id === selectedClasse)
  const matiereSelectionnee = matieres.find(m => m.id === selectedMatiere)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Saisie des notes</h1>
          <p className="text-gray-500 text-sm">Sélectionnez une classe, matière et trimestre</p>
        </div>

        {/* Filtres */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Classe" value={selectedClasse} onChange={e => setSelectedClasse(e.target.value)}>
              <option value="">Choisir une classe</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </Select>
            <Select label="Matière" value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)} disabled={!selectedClasse}>
              <option value="">Choisir une matière</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.nom} (Coef. {m.coefficient})</option>)}
            </Select>
            <Select label="Trimestre" value={selectedTrimestre} onChange={e => setSelectedTrimestre(e.target.value)}>
              <option value="1">1er Trimestre</option>
              <option value="2">2ème Trimestre</option>
              <option value="3">3ème Trimestre</option>
            </Select>
          </div>
        </Card>

        {/* Tableau de saisie */}
        {selectedClasse && selectedMatiere && (
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">
                  {classeSelectionnee?.nom} — {matiereSelectionnee?.nom}
                </h2>
                <p className="text-sm text-gray-400">Trimestre {selectedTrimestre} · {eleves.length} élève(s)</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" loading={saving} onClick={() => sauvegarder('brouillon')}>
                  <Save size={14} />
                  Sauvegarder
                </Button>
                <Button size="sm" loading={saving} onClick={() => sauvegarder('soumis')}>
                  <Send size={14} />
                  Soumettre
                </Button>
              </div>
            </div>

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
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Devoir 1</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Devoir 2</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Devoir 3</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Compo</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Moyenne</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {eleves.map(eleve => {
                      const g = grades[eleve.id] || {}
                      const devoirs = [g.devoir_1, g.devoir_2, g.devoir_3].filter(d => d !== undefined && d !== '' && d !== null)
                      const moy = calculerMoyenneMatiere(devoirs, g.composition)
                      const statusColor = g.statut === 'valide' ? 'green' : g.statut === 'soumis' ? 'yellow' : 'gray'

                      return (
                        <tr key={eleve.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {eleve.prenom} {eleve.nom}
                          </td>
                          {['devoir_1', 'devoir_2', 'devoir_3', 'composition'].map(field => (
                            <td key={field} className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                max="20"
                                step="0.25"
                                disabled={g.statut === 'valide'}
                                value={g[field] ?? ''}
                                onChange={e => updateGrade(eleve.id, field, e.target.value)}
                                className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400 mx-auto block"
                                placeholder="—"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            <span className={`font-bold ${moy !== null ? (moy >= 10 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
                              {moy !== null ? formatNote(moy) : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge color={statusColor}>
                              {g.statut === 'valide' ? 'Validé' : g.statut === 'soumis' ? 'Soumis' : 'Brouillon'}
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
