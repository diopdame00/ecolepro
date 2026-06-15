import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Input, Modal } from '../../components/ui'
import {
  Plus, Trash2, Save, Copy,
  BookOpen, GraduationCap,
  Wallet, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

// Extrait le niveau depuis le nom de classe : "3ème A" → "3ème", "6ème B" → "6ème"
function extractNiveau(nomClasse) {
  const match = nomClasse?.match(/^(\d+ème|\d+ere?|TL|TS|TES|1ère?|2nde?|Terminale?\s*\w*)/i)
  return match ? match[1].trim() : nomClasse?.split(' ')[0] || nomClasse || 'Autre'
}

export default function ConfigurationPage() {
  const { schoolId } = useAuth()
  const [classes, setClasses]               = useState([])
  const [subjects, setSubjects]             = useState([])
  const [selectedClass, setSelectedClass]   = useState(null)
  const [classSubjects, setClassSubjects]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [savingFrais, setSavingFrais]       = useState(false)
  const [addOpen, setAddOpen]               = useState(false)
  const [dupOpen, setDupOpen]               = useState(false)
  const [dupTarget, setDupTarget]           = useState('')
  const [newSub, setNewSub]                 = useState({ subject_id: '', coefficient: 1 })

  // Frais par NIVEAU (édition locale)
  // { [niveau]: { frais_inscription, frais_scolarite, dirty } }
  const [fraisNiveau, setFraisNiveau] = useState({})

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
      .from('classes')
      .select('*')
      .eq('school_id', schoolId)
      .order('nom')
    const liste = data || []
    setClasses(liste)

    // Construire fraisNiveau : une entrée par niveau unique
    // Si plusieurs classes du même niveau ont des frais différents, on prend la première non-nulle
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
        // Prendre la valeur si l'existante est vide
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
    const { data } = await supabase.from('subjects').select('*').eq('school_id', schoolId).order('nom')
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
        // Récupérer toutes les classes de ce niveau
        const classesNiveau = classes.filter(c => extractNiveau(c.nom) === niveau)
        for (const c of classesNiveau) {
          const { error } = await supabase
            .from('classes')
            .update({
              frais_inscription: vals.frais_inscription ? Number(vals.frais_inscription) : null,
              frais_scolarite:   vals.frais_scolarite   ? Number(vals.frais_scolarite)   : null,
            })
            .eq('id', c.id)
          if (error) throw error
        }
      }
      // Marquer tout comme propre
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

  // ── Matières par classe ───────────────────────────────────
  async function ajouterMatiereClasse() {
    if (!newSub.subject_id || !selectedClass) return
    if (classSubjects.find(cs => cs.subject_id === newSub.subject_id)) {
      toast.error('Cette matière est déjà dans la classe')
      return
    }
    try {
      const { error } = await supabase.from('class_subjects').insert({
        class_id:    selectedClass.id,
        subject_id:  newSub.subject_id,
        coefficient: Number(newSub.coefficient),
      })
      if (error) throw error
      toast.success('Matière ajoutée !')
      setAddOpen(false)
      setNewSub({ subject_id: '', coefficient: 1 })
      fetchClassSubjects(selectedClass.id)
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    }
  }

  async function supprimerMatiereClasse(id) {
    if (!confirm('Supprimer cette matière de la classe ?')) return
    const { error } = await supabase.from('class_subjects').delete().eq('id', id)
    if (error) { toast.error('Erreur'); return }
    fetchClassSubjects(selectedClass.id)
  }

  async function updateCoefficient(id, coef) {
    const val = Math.max(0.5, Math.min(10, Number(coef)))
    await supabase.from('class_subjects').update({ coefficient: val }).eq('id', id)
    fetchClassSubjects(selectedClass.id)
  }

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

  async function creerEtAjouter(nom) {
    if (!nom.trim()) return
    try {
      const { data: sub, error } = await supabase
        .from('subjects')
        .insert({ nom: nom.trim(), school_id: schoolId, coefficient: 1 })
        .select()
        .single()
      if (error) throw error
      await supabase.from('class_subjects').insert({
        class_id:    selectedClass.id,
        subject_id:  sub.id,
        coefficient: 1,
      })
      fetchSubjects()
      fetchClassSubjects(selectedClass.id)
      setAddOpen(false)
      toast.success('Matière créée et ajoutée !')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const totalCoefs     = classSubjects.reduce((acc, cs) => acc + Number(cs.coefficient), 0)
  const matieresDispo  = subjects.filter(s => !classSubjects.find(cs => cs.subject_id === s.id))
  const niveauxDirty   = Object.values(fraisNiveau).filter(v => v.dirty).length
  // Niveaux triés (ordre naturel : 6ème, 5ème, 4ème, 3ème…)
  const niveauxSorted  = Object.keys(fraisNiveau).sort((a, b) => {
    const numA = parseInt(a) || 99
    const numB = parseInt(b) || 99
    return numB - numA // décroissant : 6→5→4→3
  })

  // ══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Configuration</h1>
          <p className="text-gray-500 text-sm">Paramètres pédagogiques et frais scolaires</p>
        </div>

        {/* ══ SECTION FRAIS PAR NIVEAU ══ */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-primary-600" />
              <div>
                <h2 className="font-bold text-gray-900">Frais scolaires par niveau</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Les frais s'appliquent à toutes les classes du même niveau — utilisés automatiquement lors des paiements
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
            <div className="p-8 text-center text-gray-400 text-sm">
              Aucune classe créée. Créez d'abord vos classes.
            </div>
          ) : (
            <div>
              {/* En-têtes */}
              <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-4">Niveau</div>
                <div className="col-span-4">Inscription (F CFA)</div>
                <div className="col-span-4">Mensualité (F CFA)</div>
              </div>

              <div className="divide-y divide-gray-50">
                {niveauxSorted.map(niveau => {
                  const vals    = fraisNiveau[niveau] || {}
                  const isDirty = vals.dirty
                  // Nombre de classes concernées
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
                          <div className="text-xs text-gray-400">
                            {nbClasses} classe{nbClasses > 1 ? 's' : ''}
                          </div>
                        </div>
                        {isDirty && (
                          <span className="ml-1 w-2 h-2 bg-amber-400 rounded-full shrink-0" title="Non sauvegardé" />
                        )}
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          min="0"
                          step="500"
                          placeholder="ex: 15000"
                          value={vals.frais_inscription}
                          onChange={e => handleFraisNiveauChange(niveau, 'frais_inscription', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          min="0"
                          step="500"
                          placeholder="ex: 12000"
                          value={vals.frais_scolarite}
                          onChange={e => handleFraisNiveauChange(niveau, 'frais_scolarite', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Résumé bas */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle size={13} className="text-green-500" />
                Les montants seront pré-remplis automatiquement lors de l'enregistrement d'un paiement.
                {niveauxDirty > 0 && (
                  <span className="ml-auto text-amber-600 font-semibold">
                    {niveauxDirty} niveau(x) modifié(s) — pensez à sauvegarder
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* ══ SECTION MATIÈRES PAR CLASSE ══ */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BookOpen size={16} />
              Classe en cours de configuration :
            </div>
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <button key={c.id}
                  onClick={() => setSelectedClass(c)}
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
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus size={14} /> Ajouter une matière
                  </Button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : classSubjects.length === 0 ? (
              <div className="p-8 text-center">
                <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucune matière configurée pour cette classe</p>
                <Button className="mt-3" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} /> Ajouter la première matière
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
                      <input
                        type="number"
                        min="0.5" max="10" step="0.5"
                        value={cs.coefficient}
                        onChange={e => updateCoefficient(cs.id, e.target.value)}
                        className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
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

      {/* ── Modale ajout matière ── */}
      <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setNewSub({ subject_id: '', coefficient: 1 }) }}
        title={`Ajouter une matière à ${selectedClass?.nom}`}>
        <div className="space-y-4">
          {matieresDispo.length > 0 ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Matière existante</label>
                <select value={newSub.subject_id} onChange={e => setNewSub({ ...newSub, subject_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Sélectionner une matière</option>
                  {matieresDispo.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
              <Input label="Coefficient" type="number" min="0.5" max="10" step="0.5"
                value={newSub.coefficient}
                onChange={e => setNewSub({ ...newSub, coefficient: e.target.value })} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setAddOpen(false)}>Annuler</Button>
                <Button onClick={ajouterMatiereClasse} disabled={!newSub.subject_id}>
                  <Plus size={16} /> Ajouter
                </Button>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">Toutes les matières sont déjà dans cette classe. Créez-en une nouvelle :</p>
              <CreateSubjectInline onCreer={creerEtAjouter} onClose={() => setAddOpen(false)} />
            </div>
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

function CreateSubjectInline({ onCreer, onClose }) {
  const [nom, setNom] = useState('')
  return (
    <div className="space-y-3">
      <Input label="Nom de la matière" placeholder="ex: Mathématiques"
        value={nom} onChange={e => setNom(e.target.value)} />
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={() => onCreer(nom)} disabled={!nom.trim()}>
          <Plus size={16} /> Créer et ajouter
        </Button>
      </div>
    </div>
  )
}
