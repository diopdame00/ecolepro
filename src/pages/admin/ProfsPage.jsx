import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../components/ui'
import {
  GraduationCap, Plus, Trash2, BookOpen, Search, X,
  Key, Copy, CheckCircle, Clock, AlertTriangle, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Validation Zod-like ──────────────────────────────────────
const PROF_SCHEMA = {
  prenom: v => v.trim().length >= 2 || 'Prénom trop court',
  nom:    v => v.trim().length >= 2 || 'Nom trop court',
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Email invalide',
}

function validateProf(form) {
  const errors = {}
  Object.entries(PROF_SCHEMA).forEach(([field, fn]) => {
    const result = fn(form[field] || '')
    if (result !== true) errors[field] = result
  })
  return errors
}

export default function ProfsPage() {
  const { schoolId } = useAuth()
  const [profs, setProfs]               = useState([])
  const [profsFiltres, setProfsFiltres] = useState([])
  const [classes, setClasses]           = useState([])
  const [subjects, setSubjects]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalOpen, setModalOpen]       = useState(false)
  const [assignOpen, setAssignOpen]     = useState(false)
  const [codeModal, setCodeModal]       = useState(null) // { activation_code, temp_password, prenom, nom }
  const [selectedProf, setSelectedProf] = useState(null)
  const [search, setSearch]             = useState('')
  const [creating, setCreating]         = useState(false)
  const [form, setForm] = useState({ prenom: '', nom: '', email: '' })
  const [formErrors, setFormErrors]     = useState({})
  const [assign, setAssign] = useState({ class_id: '', subject_id: '' })

  useEffect(() => { if (schoolId) { fetchProfs(); fetchClasses(); fetchSubjects() } }, [schoolId])

  useEffect(() => {
    setProfsFiltres(
      search
        ? profs.filter(p => `${p.prenom} ${p.nom} ${p.email}`.toLowerCase().includes(search.toLowerCase()))
        : profs
    )
  }, [profs, search])

  async function fetchProfs() {
    const { data } = await supabase
      .from('users')
      .select('*, prof_classes(*, classes(nom), subjects(nom))')
      .eq('school_id', schoolId)
      .eq('role', 'prof')
      .order('nom')
    setProfs(data || [])
    setLoading(false)
  }

  async function fetchClasses() {
    const { data } = await supabase.from('classes').select('*').eq('school_id', schoolId).order('nom')
    setClasses(data || [])
  }

  async function fetchSubjects() {
    const { data } = await supabase.from('subjects').select('*').eq('school_id', schoolId).order('nom')
    setSubjects(data || [])
  }

  // ── Créer un prof via Edge Function sécurisée ─────────────
  async function creerProf() {
    const errors = validateProf(form)
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({})
    setCreating(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prenom: form.prenom.trim(),
            nom:    form.nom.trim(),
            email:  form.email.trim().toLowerCase(),
            role:   'prof',
          }),
        }
      )

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur Edge Function')

      // Afficher le code dans une modale dédiée
      setCodeModal({
        activation_code: result.activation_code,
        temp_password:   result.temp_password,
        prenom:          form.prenom,
        nom:             form.nom,
        email:           form.email,
        expires_at:      result.expires_at,
      })

      setModalOpen(false)
      setForm({ prenom: '', nom: '', email: '' })
      fetchProfs()

    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function supprimerProf(prof) {
    if (!confirm(`Supprimer ${prof.prenom} ${prof.nom} ? Cette action est irréversible.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'delete_user', user_id: prof.id }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur suppression')
      toast.success('Professeur supprimé')
      fetchProfs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function assignerClasse() {
    if (!assign.class_id || !assign.subject_id) { toast.error('Sélectionnez une classe et une matière'); return }
    const { error } = await supabase.from('prof_classes').insert({
      prof_id:    selectedProf.id,
      class_id:   assign.class_id,
      subject_id: assign.subject_id,
    })
    if (error) { toast.error(error.message.includes('unique') ? 'Déjà assigné à cette classe/matière' : 'Erreur'); return }
    toast.success('Affectation enregistrée')
    setAssignOpen(false)
    setAssign({ class_id: '', subject_id: '' })
    fetchProfs()
  }

  async function retirerAffectation(profClassId) {
    if (!confirm('Retirer cette affectation ?')) return
    await supabase.from('prof_classes').delete().eq('id', profClassId)
    fetchProfs()
  }

  // ── Régénérer le code d'activation ───────────────────────
  async function regenererCode(prof) {
    if (!confirm(`Régénérer le code d'activation de ${prof.prenom} ${prof.nom} ? L'ancien code sera invalidé.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'regenerate_code', user_id: prof.id }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setCodeModal({ ...result, prenom: prof.prenom, nom: prof.nom, email: prof.email })
    } catch (err) {
      toast.error(err.message)
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié !`))
  }

  // ══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Professeurs</h1>
            <p className="text-gray-500 text-sm">{profs.length} enseignant(s) configuré(s)</p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Ajouter un professeur
          </Button>
        </div>

        {/* Barre de recherche */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un professeur…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profsFiltres.length === 0 ? (
          <Card>
            <EmptyState
              icon={GraduationCap}
              title="Aucun professeur"
              description="Ajoutez vos enseignants pour leur permettre de saisir des notes"
              action={<Button onClick={() => setModalOpen(true)}><Plus size={16} />Ajouter</Button>}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {profsFiltres.map(prof => (
              <Card key={prof.id} className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary-100 rounded-xl flex items-center justify-center font-bold text-primary-700">
                      {prof.prenom?.[0]}{prof.nom?.[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{prof.prenom} {prof.nom}</div>
                      <div className="text-xs text-gray-500">{prof.email}</div>
                    </div>
                    {/* Badge statut activation */}
                    {prof.must_change_password && (
                      <Badge color="yellow">
                        <Clock size={10} className="inline mr-1" />
                        En attente d'activation
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {prof.must_change_password && (
                      <Button variant="ghost" size="sm" onClick={() => regenererCode(prof)} title="Régénérer le code">
                        <RefreshCw size={14} />
                      </Button>
                    )}
                    <Button variant="secondary" size="sm"
                      onClick={() => { setSelectedProf(prof); setAssignOpen(true) }}>
                      <BookOpen size={14} /> Affecter
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => supprimerProf(prof)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {/* Affectations */}
                {prof.prof_classes?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prof.prof_classes.map(pc => (
                      <div key={pc.id}
                        className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2 py-1 text-xs text-gray-700">
                        <span className="font-medium">{pc.classes?.nom}</span>
                        <span className="text-gray-400">·</span>
                        <span>{pc.subjects?.nom}</span>
                        <button onClick={() => retirerAffectation(pc.id)}
                          className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Modale création prof ── */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setFormErrors({}) }} title="Nouveau professeur">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prénom *" placeholder="Amadou"
              value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
              error={formErrors.prenom} />
            <Input label="Nom *" placeholder="Diallo"
              value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom} />
          </div>
          <Input label="Email *" type="email" placeholder="a.diallo@ecole.sn"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            error={formErrors.email} />

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
            Un code d'activation temporaire (48h) sera généré automatiquement. Communiquez-le au professeur.
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={creerProf} loading={creating}>
              <Plus size={16} /> Créer et générer le code
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modale affichage code d'activation ── */}
      <Modal isOpen={!!codeModal} onClose={() => setCodeModal(null)} title="Code d'activation généré">
        {codeModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle size={20} className="text-green-600 shrink-0" />
              <div>
                <div className="font-semibold text-green-900">{codeModal.prenom} {codeModal.nom}</div>
                <div className="text-xs text-green-700">{codeModal.email}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Code d'activation</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <Key size={16} className="text-primary-600 shrink-0" />
                  <span className="font-mono font-bold text-lg tracking-widest text-gray-900 flex-1">
                    {codeModal.activation_code}
                  </span>
                  <button onClick={() => copyToClipboard(codeModal.activation_code, 'Code')}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                    <Copy size={14} className="text-gray-500" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Mot de passe provisoire</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="font-mono text-sm text-gray-900 flex-1 break-all">{codeModal.temp_password}</span>
                  <button onClick={() => copyToClipboard(codeModal.temp_password, 'Mot de passe')}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                    <Copy size={14} className="text-gray-500" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                Ce code expire dans <strong>48h</strong>. Le professeur sera obligé de changer son mot de passe à la première connexion.
                <br />Expire le : <strong>{new Date(codeModal.expires_at).toLocaleString('fr-FR')}</strong>
              </div>
            </div>

            <Button className="w-full" onClick={() => setCodeModal(null)}>Compris, fermer</Button>
          </div>
        )}
      </Modal>

      {/* ── Modale affectation ── */}
      <Modal isOpen={assignOpen} onClose={() => { setAssignOpen(false); setAssign({ class_id: '', subject_id: '' }) }}
        title={`Affecter ${selectedProf?.prenom} ${selectedProf?.nom}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe</label>
            <select value={assign.class_id} onChange={e => setAssign({ ...assign, class_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sélectionner une classe</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
            <select value={assign.subject_id} onChange={e => setAssign({ ...assign, subject_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sélectionner une matière</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
            <Button onClick={assignerClasse}>Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
