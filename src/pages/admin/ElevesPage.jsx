import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import { SelecteurAnnee, BandeauArchive } from '../../components/shared/SelecteurAnnee'
import ImportSmart from '../../components/shared/ImportSmart'
import { Users, Plus, Search, X, QrCode, Download, Upload, RefreshCw, Copy, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_FORM = { prenom: '', nom: '', sexe: 'M', date_naissance: '', classe_id: '', contact_parent: '' }

export default function ElevesPage() {
  const { schoolId } = useAuth()
  const {
    yearId, annee, anneeActive, anneesDispos,
    anneeSelectionnee, setAnneeSelectionnee,
    retourAnneeActive, enModeArchive,
  } = useAnneeActive()

  const [eleves, setEleves]         = useState([])
  const [classes, setClasses]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterClasse, setFilterClasse] = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [qrModal, setQrModal]       = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)

  useEffect(() => {
    if (schoolId && yearId) { fetchClasses(); fetchEleves() }
  }, [schoolId, yearId])

  // ── Charger les élèves via enrollments ───────────────────────────
  async function fetchEleves() {
    setLoading(true)
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id,
        redoublant,
        contact_parent,
        qr_token,
        first_login_at,
        students(id, prenom, nom, sexe, date_naissance, unique_code),
        classes(id, nom)
      `)
      .eq('year_id', yearId)
      .eq('school_id', schoolId)
      .order('students(nom)')

    if (error) console.error('fetchEleves:', error)
    // Aplatir pour compatibilité avec le reste du composant
    const liste = (data || []).map(e => ({
      enrollment_id:  e.id,
      id:             e.students?.id,
      prenom:         e.students?.prenom,
      nom:            e.students?.nom,
      sexe:           e.students?.sexe,
      date_naissance: e.students?.date_naissance,
      unique_code:    e.students?.unique_code,
      classe_id:      e.classes?.id,
      classes:        e.classes,
      contact_parent: e.contact_parent,
      redoublant:     e.redoublant,
      qr_token:       e.qr_token,
      first_login_at: e.first_login_at,
    }))
    setEleves(liste)
    setLoading(false)
  }

  async function fetchClasses() {
    if (!yearId) return
    const { data } = await supabase
      .from('classes')
      .select('id, nom')
      .eq('school_id', schoolId)
      .eq('year_id', yearId)
      .order('nom')
    setClasses(data || [])
  }

  // ── Inscrire un élève (via fonction SQL) ─────────────────────────
  async function creerEleve() {
    if (!form.prenom.trim() || !form.nom.trim() || !form.classe_id) {
      toast.error('Prénom, nom et classe sont obligatoires')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('inscrire_eleve', {
        p_school_id:  schoolId,
        p_class_id:   form.classe_id,
        p_prenom:     form.prenom.trim(),
        p_nom:        form.nom.trim(),
        p_sexe:       form.sexe.toUpperCase(),
        p_date_naiss: form.date_naissance || null,
        p_contact:    form.contact_parent || null,
        p_redoublant: false,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast.success('Élève inscrit !')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      fetchEleves()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Supprimer un élève (supprime l'enrollment) ───────────────────
  async function supprimerEleve(enrollmentId, nom) {
    if (!confirm(`Supprimer l'inscription de ${nom} ? Cette action est irréversible.`)) return
    const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId)
    if (error) { toast.error('Erreur suppression'); return }
    toast.success('Élève retiré de cette année')
    fetchEleves()
  }

  // ── Générer QR Code ───────────────────────────────────────────────
  async function genererQR(student) {
    try {
      const { data, error } = await supabase.rpc('generate_student_qr', {
        p_student_id: student.id,
      })
      if (error || !data?.success) throw new Error(data?.error || 'Erreur génération QR')
      toast.success('QR Code généré !')
      await fetchEleves()
      const updated = eleves.find(e => e.id === student.id)
      if (updated) setQrModal({ student, qr_token: data.token })
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Filtres ──────────────────────────────────────────────────────
  const elevesFiltres = eleves.filter(e => {
    const matchSearch = !search || `${e.prenom} ${e.nom}`.toLowerCase().includes(search.toLowerCase())
    const matchClasse = !filterClasse || e.classe_id === filterClasse
    return matchSearch && matchClasse
  })

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Élèves</h1>
            <p className="text-gray-500 text-sm">{eleves.length} élève(s) inscrit(s) · {annee}</p>
            <SelecteurAnnee
              anneeActive={anneeActive}
              anneesDispos={anneesDispos.map(a => a.annee)}
              anneeSelectionnee={anneeSelectionnee}
              setAnneeSelectionnee={(a) => {
                const found = anneesDispos.find(x => x.annee === a)
                if (found) setAnneeSelectionnee(found.id)
                else retourAnneeActive()
              }}
              className="mt-1"
            />
          </div>
          {!enModeArchive && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={15} /> Importer
              </Button>
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} /> Ajouter un élève
              </Button>
            </div>
          )}
        </div>

        {enModeArchive && (
          <BandeauArchive annee={anneeSelectionnee} onRetour={retourAnneeActive} />
        )}

        {/* Filtres */}
        <Card className="p-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-xl px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input placeholder="Rechercher un élève…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent flex-1 text-sm outline-none" />
              {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
            </div>
            <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </Card>

        {/* Liste */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">{elevesFiltres.length} résultat(s)</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : elevesFiltres.length === 0 ? (
            <EmptyState icon={Users} title="Aucun élève"
              description="Ajoutez des élèves ou vérifiez vos filtres" />
          ) : (
            <div className="divide-y divide-gray-50">
              {elevesFiltres.map(eleve => (
                <div key={eleve.enrollment_id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                  <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center
                                  text-sm font-bold text-primary-700 shrink-0">
                    {eleve.prenom?.[0]}{eleve.nom?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">
                      {eleve.prenom} {eleve.nom}
                      {eleve.redoublant && (
                        <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Redoublant</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {eleve.classes?.nom} · {eleve.unique_code || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {eleve.qr_token ? (
                      <button onClick={() => setQrModal({ student: eleve, qr_token: eleve.qr_token })}
                        className="p-1.5 hover:bg-green-50 rounded-lg text-green-500 transition-colors">
                        <QrCode size={15} />
                      </button>
                    ) : (
                      !enModeArchive && (
                        <button onClick={() => genererQR(eleve)}
                          className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-300 hover:text-primary-500 transition-colors"
                          title="Générer QR">
                          <QrCode size={15} />
                        </button>
                      )
                    )}
                    {!enModeArchive && (
                      <button onClick={() => supprimerEleve(eleve.enrollment_id, `${eleve.prenom} ${eleve.nom}`)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-200 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modale ajout élève */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM) }}
        title="Inscrire un élève">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
              <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sexe *</label>
              <select value={form.sexe} onChange={e => setForm({ ...form, sexe: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
              <input type="date" value={form.date_naissance}
                onChange={e => setForm({ ...form, date_naissance: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe *</label>
            <select value={form.classe_id} onChange={e => setForm({ ...form, classe_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sélectionner une classe</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact parent</label>
            <input value={form.contact_parent} onChange={e => setForm({ ...form, contact_parent: e.target.value })}
              placeholder="+221 77 xxx xx xx"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button className="flex-1" loading={saving} onClick={creerEleve}>
              <Plus size={15} /> Inscrire
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modale QR */}
      {qrModal && (
        <Modal isOpen={!!qrModal} onClose={() => setQrModal(null)}
          title={`QR Code — ${qrModal.student.prenom} ${qrModal.student.nom}`}>
          <div className="text-center space-y-4">
            <div className="bg-gray-50 rounded-2xl p-6">
              <p className="text-xs text-gray-400 mb-2">Code d'accès parent</p>
              <p className="text-2xl font-black text-gray-900 tracking-wider font-mono">
                {qrModal.qr_token}
              </p>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(qrModal.qr_token); toast.success('Copié !') }}
              className="w-full py-3 bg-primary-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
              <Copy size={16} /> Copier le code
            </button>
          </div>
        </Modal>
      )}

      {/* Import */}
      {importOpen && (
        <ImportSmart
          schoolId={schoolId}
          yearId={yearId}
          classes={classes}
          onClose={() => setImportOpen(false)}
          onSuccess={() => { setImportOpen(false); fetchEleves() }}
        />
      )}
    </DashboardLayout>
  )
}
