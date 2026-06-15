import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Input, Modal } from '../../components/ui'
import {
  Plus, Trash2, Save, Copy,
  BookOpen, GraduationCap,
  Wallet, CheckCircle, Library
} from 'lucide-react'
import toast from 'react-hot-toast'

function extractNiveau(nomClasse) {
  const match = nomClasse?.match(/^(\d+ème|\d+ere?|TL|TS|TES|1ère?|2nde?|Terminale?\s*\w*)/i)
  return match ? match[1].trim() : nomClasse?.split(' ')[0] || nomClasse || 'Autre'
}

export default function ConfigurationPage() {
  const { schoolId } = useAuth()
  const [classes, setClasses]             = useState([])
  const [subjects, setSubjects]           = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [classSubjects, setClassSubjects] = useState([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [savingFrais, setSavingFrais]     = useState(false)
  const [dupOpen, setDupOpen]             = useState(false)
  const [dupTarget, setDupTarget]         = useState('')

  // Frais par niveau
  const [fraisNiveau, setFraisNiveau] = useState({})

  // ── Gestion matières globales ──
  const [newSubjectNom, setNewSubjectNom]   = useState('')
  const [addingSubject, setAddingSubject]   = useState(false)

  // ── Assignation matière à classe ──
  const [assignOpen, setAssignOpen]         = useState(false)
  const [assignSubjectId, setAssignSubjectId] = useState('')
  const [assignCoef, setAssignCoef]         = useState(1)

  useEffect(() => {
    if (schoolId) {
      fetchClasses()
      fetchSubjects()
    }
  }, [schoolId])

  useEffect(() => {
    if (selectedClass) fetchClassSubjects(selectedClass.id)
    else setClassSubjects([])
  }, [selectedClass])

  async function fetchClasses() {
    const { data } = await supabase
      .from('classes').select('*').eq('school_id', schoolId).order('nom')
    const liste = data || []
    setClasses(liste)

    const niveauxMap = {}
    for (const c of liste) {
      const niv = extractNiveau(c.nom)
      if (!niveauxMap[niv]) {
        niveauxMap[niv] = {
          frais_inscription: c.frais_inscription || '',
          frais_scolarite:   c.frais_scolarite   || '',
          dirty: false,
        }
      } else {
        if (!niveauxMap[niv].frais_inscription && c.frais_inscription)
          niveauxMap[niv].frais_inscription = c.frais_inscription
        if (!niveauxMap[niv].frais_scolarite && c.frais_scolarite)
          niveauxMap[niv].frais_scolarite = c.frais_scolarite
      }
    }
    setFraisNiveau(niveauxMap)
    if (!selectedClass && liste.length > 0) setSelectedClass(liste[0])
    setLoading(false)
  }

  async function fetchSubjects() {
    const { data } = await supabase
      .from('subjects').select('*').eq('school_id', schoolId).order('nom')
    setSubjects(data || [])
  }

  async function fetchClassSubjects(classId) {
    const { data } = await supabase
      .from('class_subjects')
      .select('*, subjects(nom)')
      .eq('class_id', classId)
      .order('subjects(nom)')
    setClassSubjects(data || [])
  }

  // ── Créer une matière globale ─────────────────────────────
  async function creerMatiere() {
    const nom = newSubjectNom.trim()
    if (!nom) return
    if (subjects.find(s => s.nom.toLowerCase() === nom.toLowerCase())) {
      toast.error('Cette matière existe déjà')
      return
    }
    setAddingSubject(true)
    try {
      const { error } = await supabase
        .from('subjects')
        .insert({ nom, school_id: schoolId, coefficient: 1 })
      if (error) throw error
      setNewSubjectNom('')
      toast.success(`"${nom}" ajoutée !`)
      fetchSubjects()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAddingSubject(false)
    }
  }

  async function supprimerMatiere(id, nom) {
    if (!confirm(`Supprimer la matière "${nom}" ? Elle sera retirée de toutes les classes.`)) return
    const { error } = await supabase.from('subjects').delete().eq('id', id)
    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Matière supprimée')
    fetchSubjects()
    if (selectedClass) fetchClassSubjects(selectedClass.id)
  }

  // ── Assigner une matière à la classe ─────────────────────
  async function assignerMatiere() {
    if (!assignSubjectId || !selectedClass) return
    if (classSubjects.find(cs => cs.subject_id === assignSubjectId)) {
      toast.error('Cette matière est déjà dans la classe')
      return
    }
    try {
      const { error } = await supabase.from('class_subjects').insert({
        class_id:    selectedClass.id,
        subject_id:  assignSubjectId,
        coefficient: Number(assignCoef),
      })
      if (error) throw error
      toast.success('Matière assignée !')
      setAssignOpen(false)
      setAssignSubjectId('')
      setAssignCoef(1)
      fetchClassSubjects(selectedClass.id)
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    }
  }

  async function supprimerMatiereClasse(id) {
    if (!confirm('Retirer cette matière de la classe ?')) return
    const { error } = await supabase.from('class_subjects').delete().eq('id', id)
    if (error) { toast.error('Erreur'); return }
    fetchClassSubjects(selectedClass.id)
  }

  async function updateCoefficient(id, coef) {
    const val = Math.max(0.5, Math.min(10, Number(coef)))
    await supabase.from('class_subjects').update({ coefficient: val }).eq('id', id)
    fetchClassSubjects(selectedClass.id)
  }

  // ── Frais par niveau ──────────────────────────────────────
  function handleFraisNiveauChange(niveau, field, value) {
    setFraisNiveau(prev => ({
      ...prev,
      [niveau]: { ...prev[niveau], [field]: value, dirty: true }
    }))
  }

  async function sauvegarderFraisNiveau() {
    const niveauxDirty = Object.entries(fraisNiveau).filter(([, v]) => v.dirty)
    if (niveauxDirty.length === 0) { toast('Aucune modification', { icon: 'ℹ️' }); return }
    setSavingFrais(true)
    try {
      for (const [niveau, vals] of niveauxDirty) {
        const classesNiveau = classes.filter(c => extractNiveau(c.nom) === niveau)
        for (const c of classesNiveau) {
          const { error } = await supabase.from('classes').update({
            frais_inscription: vals.frais_inscription ? Number(vals.frais_inscription) : null,
            frais_scolarite:   vals.frais_scolarite   ? Number(vals.frais_scolarite)   : null,
          }).eq('id', c.id)
          if (error) throw error
        }
      }
      setFraisNiveau(prev => {
        const next = { ...prev }
        for (const niv of Object.keys(next)) next[niv] = { ...next[niv], dirty: false }
        return next
      })
      toast.success(`${niveauxDirty.length} niveau(x) mis à jour !`)
      fetchClasses()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setSavingFrais(false)
    }
  }

  // ── Dupliquer config matières ─────────────────────────────
  async function dupliquerConfig() {
    if (!dupTarget) { toast.error('Sélectionnez une classe cible'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('duplicate_class_subjects', {
        p_source_class_id: selectedClass.id,
        p_target_class_id: dupTarget,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      toast.success(`${data.copied} matière(s) copiée(s) vers ${classes.find(c => c.id === dupTarget)?.nom}`)
      setDupOpen(false)
      setDupTarget('')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalCoefs    = classSubjects.reduce((acc, cs) => acc + Number(cs.coefficient), 0)
  // Matières pas encore assignées à cette classe
  const matieresDispo = subjects.filter(s => !classSubjects.find(cs => cs.subject_id === s.id))
  const niveauxDirty  = Object.values(fraisNiveau).filter(v => v.dirty).length
  const niveauxSorted = Object.keys(fraisNiveau).sort((a, b) => {
    const numA = parseInt(a) || 99
    const numB = parseInt(b) || 99
    return numB - numA
  })

  // ══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Configuration</h1>
          <p className="text-gray-500 text-sm">Paramètres pédagogiques et frais scolaires</p>
        </div>

        {/* ══ 1. MATIÈRES DE L'ÉCOLE ══ */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Library size={18} className="text-primary-600" />
            <div>
              <h2 className="font-bold text-gray-900">Matières de l'école</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Créez d'abord toutes les matières — vous pourrez ensuite les assigner aux classes
              </p>
            </div>
          </div>

          {/* Champ de saisie rapide */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom de la matière (ex: Mathématiques)"
                value={newSubjectNom}
                onChange={e => setNewSubjectNom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && creerMatiere()}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <Button onClick={creerMatiere} loading={addingSubject} disabled={!newSubjectNom.trim()}>
                <Plus size={16} /> Ajouter
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 ml-1">Appuyez sur Entrée pour valider rapidement</p>
          </div>

          {/* Liste des matières */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subjects.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
              Aucune matière créée. Commencez par en ajouter une.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {subjects.map(s => {
                // Combien de classes utilisent cette matière ?
                const usedCount = classes.filter(c =>
                  classSubjects.find(cs => cs.subject_id === s.id && cs.class_id === c.id)
                ).length
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                      <BookOpen size={14} className="text-primary-600" />
                    </div>
                    <span className="flex-1 font-medium text-gray-900 text-sm">{s.nom}</span>
                    <button
                      onClick={() => supprimerMatiere(s.id, s.nom)}
                      className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-gray-300"
                      title="Supprimer la matière"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
              <div className="px-5 py-2.5 bg-gray-50 text-xs text-gray-400 flex items-center gap-1.5">
                <CheckCircle size={12} className="text-green-500" />
                {subjects.length} matière{subjects.length > 1 ? 's' : ''} dans le catalogue de l'école
              </div>
            </div>
          )}
        </Card>

        {/* ══ 2. FRAIS PAR NIVEAU ══ */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-primary-600" />
              <div>
                <h2 className="font-bold text-gray-900">Frais scolaires par niveau</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  S'appliquent à toutes les classes du même niveau
                </p>
              </div>
            </div>
            <Button onClick={sauvegarderFraisNiveau} loading={savingFrais} size="sm"
              disabled={niveauxDirty === 0}>
              <Save size={14} />
              {niveauxDirty > 0 ? `Sauvegarder (${niveauxDirty})` : 'Sauvegarder'}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : niveauxSorted.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Aucune classe créée.</div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-4">Niveau</div>
                <div className="col-span-4">Inscription (F CFA)</div>
                <div className="col-span-4">Mensualité (F CFA)</div>
              </div>
              <div className="divide-y divide-gray-50">
                {niveauxSorted.map(niveau => {
                  const vals      = fraisNiveau[niveau] || {}
                  const isDirty   = vals.dirty
                  const nbClasses = classes.filter(c => extractNiveau(c.nom) === niveau).length
                  return (
                    <div key={niveau}
                      className={`grid grid-cols-12 gap-2 px-5 py-3 items-center transition-colors
                        ${isDirty ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      <div className="col-span-4 flex items-center gap-2">
                        <div className="w-9 h-9 bg-primary-100 rounded-xl flex items-center justify-center font-black text-primary-700 text-sm shrink-0">
                          {niveau.replace(/ème|ere?/i, '')}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{niveau}</div>
                          <div className="text-xs text-gray-400">{nbClasses} classe{nbClasses > 1 ? 's' : ''}</div>
                        </div>
                        {isDirty && <span className="w-2 h-2 bg-amber-400 rounded-full shrink-0" />}
                      </div>
                      <div className="col-span-4">
                        <input type="number" min="0" step="500" placeholder="ex: 15000"
                          value={vals.frais_inscription}
                          onChange={e => handleFraisNiveauChange(niveau, 'frais_inscription', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white" />
                      </div>
                      <div className="col-span-4">
                        <input type="number" min="0" step="500" placeholder="ex: 12000"
                          value={vals.frais_scolarite}
                          onChange={e => handleFraisNiveauChange(niveau, 'frais_scolarite', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white" />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle size={13} className="text-green-500" />
                Montants pré-remplis automatiquement lors des paiements.
                {niveauxDirty > 0 && (
                  <span className="ml-auto text-amber-600 font-semibold">
                    {niveauxDirty} niveau(x) modifié(s) — pensez à sauvegarder
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ══ 3. ASSIGNATION MATIÈRES PAR CLASSE ══ */}
        {/* Sélecteur de classe */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BookOpen size={16} />
              Classe en cours de configuration :
            </div>
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <button key={c.id} onClick={() => setSelectedClass(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all
                    ${selectedClass?.id === c.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {c.nom}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {selectedClass && (
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <GraduationCap size={18} className="text-primary-600" />
                    Matières — {selectedClass.nom}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {classSubjects.length} matière(s) · Total coefficients : {totalCoefs.toFixed(1)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {classes.length > 1 && classSubjects.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => setDupOpen(true)}>
                      <Copy size={14} /> Dupliquer vers…
                    </Button>
                  )}
                  {/* Bouton assigner — disponible seulement si des matières existent */}
                  {subjects.length > 0 && (
                    <Button size="sm" onClick={() => { setAssignOpen(true); setAssignSubjectId(''); setAssignCoef(1) }}>
                      <Plus size={14} /> Assigner une matière
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : subjects.length === 0 ? (
              <div className="p-8 text-center">
                <Library size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Commencez par créer les matières de l'école ci-dessus</p>
              </div>
            ) : classSubjects.length === 0 ? (
              <div className="p-8 text-center">
                <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucune matière assignée à cette classe</p>
                <Button className="mt-3" size="sm"
                  onClick={() => { setAssignOpen(true); setAssignSubjectId(''); setAssignCoef(1) }}>
                  <Plus size={14} /> Assigner la première matière
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {classSubjects.map((cs, i) => (
                  <div key={cs.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 font-medium text-gray-900">{cs.subjects?.nom}</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Coef.</label>
                      <input type="number" min="0.5" max="10" step="0.5"
                        value={cs.coefficient}
                        onChange={e => updateCoefficient(cs.id, e.target.value)}
                        className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <button onClick={() => supprimerMatiereClasse(cs.id)}
                      className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-gray-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50">
                  <div className="flex-1 text-sm font-semibold text-gray-700">Total</div>
                  <div className="text-sm font-bold text-primary-700">{totalCoefs.toFixed(1)}</div>
                  <div className="w-7" />
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* ── Modale assignation matière à la classe ── */}
      <Modal
        isOpen={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assigner une matière à ${selectedClass?.nom}`}
      >
        <div className="space-y-4">
          {matieresDispo.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">
              Toutes les matières du catalogue sont déjà assignées à cette classe.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
                <select
                  value={assignSubjectId}
                  onChange={e => setAssignSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sélectionner une matière</option>
                  {matieresDispo.map(s => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>
              <Input label="Coefficient" type="number" min="0.5" max="10" step="0.5"
                value={assignCoef}
                onChange={e => setAssignCoef(e.target.value)} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
                <Button onClick={assignerMatiere} disabled={!assignSubjectId}>
                  <Plus size={16} /> Assigner
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Modale duplication ── */}
      <Modal isOpen={dupOpen} onClose={() => { setDupOpen(false); setDupTarget('') }}
        title={`Dupliquer la config de ${selectedClass?.nom}`}>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
            La configuration de <strong>{selectedClass?.nom}</strong> ({classSubjects.length} matière(s)) sera copiée vers la classe cible. La configuration existante de la cible sera remplacée.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe cible</label>
            <select value={dupTarget} onChange={e => setDupTarget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sélectionner une classe cible</option>
              {classes.filter(c => c.id !== selectedClass?.id).map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setDupOpen(false); setDupTarget('') }}>Annuler</Button>
            <Button onClick={dupliquerConfig} loading={saving} disabled={!dupTarget}>
              <Copy size={16} /> Dupliquer
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
