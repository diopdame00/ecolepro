import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { SelecteurAnnee, BandeauArchive } from '../../components/shared/SelecteurAnnee'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button, Modal, Badge, EmptyState } from '../../components/ui'
import ImportSmart from '../../components/shared/ImportSmart'
import {
  Users, Plus, Search, X, QrCode, Download, Eye,
  Filter, Upload, RefreshCw, Copy, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Validation Zod-like ──────────────────────────────────────
const ELEVE_SCHEMA = {
  prenom:  v => v?.trim().length >= 2 || 'Prénom trop court',
  nom:     v => v?.trim().length >= 2 || 'Nom trop court',
  sexe:    v => ['M', 'F'].includes(v?.toUpperCase()) || 'Sexe : M ou F',
  classe_id: v => !!v || 'Classe obligatoire',
}

function validateEleve(form) {
  const errors = {}
  Object.entries(ELEVE_SCHEMA).forEach(([f, fn]) => {
    const r = fn(form[f] || '')
    if (r !== true) errors[f] = r
  })
  return errors
}

const EMPTY_FORM = { prenom: '', nom: '', sexe: 'M', date_naissance: '', classe_id: '', contact_parent: '' }

// ══════════════════════════════════════════════════════════════
export default function ElevesPage() {
  const { schoolId } = useAuth()
  const [eleves, setEleves]         = useState([])
  const [classes, setClasses]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterClasse, setFilterClasse] = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [qrModal, setQrModal]       = useState(null)   // { student, qr_token }
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})

  useEffect(() => { if (schoolId) { fetchClasses(); fetchEleves() } }, [schoolId])

  async function fetchEleves() {
    const { data } = await supabase
      .from('students')
      .select('*, classes(nom), student_qr_profiles(qr_token, qr_generated_at, activation_required, first_login_at)')
      .eq('school_id', schoolId)
      .order('nom')
    setEleves(data || [])
    setLoading(false)
  }

  async function fetchClasses() {
    const { data } = await supabase.from('classes').select('id, nom').eq('school_id', schoolId).order('nom')
    setClasses(data || [])
  }

  // ── Créer un élève manuellement ──────────────────────────
  async function creerEleve() {
    const errors = validateEleve(form)
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({})
    setSaving(true)

    try {
      // Vérifier si l'élève existe déjà (même prénom + nom dans cette école)
      const annee_scolaire = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
      const { data: existants } = await supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('annee_scolaire', annee_scolaire)
        .ilike('prenom', form.prenom.trim())
        .ilike('nom', form.nom.trim())

      if (existants && existants.length > 0) {
        toast.error(`${form.prenom} ${form.nom} est déjà inscrit(e) pour cette année scolaire`)
        setSaving(false)
        return
      }

      const unique_code = `ECO-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`
      const { error } = await supabase.from('students').insert({
        prenom:          form.prenom.trim(),
        nom:             form.nom.trim(),
        sexe:            form.sexe.toUpperCase(),
        date_naissance:  form.date_naissance || null,
        classe_id:       form.classe_id,
        school_id:       schoolId,
        contact_parent:  form.contact_parent || null,
        unique_code,
        annee_scolaire:  `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      })
      if (error) throw error
      toast.success('Élève ajouté !')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      fetchEleves()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Générer QR Code élève ────────────────────────────────
  async function genererQR(student) {
    try {
      const { data, error } = await supabase.rpc('generate_student_qr', {
        p_student_id: student.id,
      })
      if (error || !data?.success) throw new Error(data?.error || 'Erreur génération QR')
      toast.success('QR Code généré !')
      await fetchEleves()
      // Ouvrir la modale QR
      const updated = await supabase
        .from('student_qr_view')
        .select('*')
        .eq('student_id', student.id)
        .single()
      setQrModal({ student, qr_token: data.qr_token, data: updated.data })
    } catch (err) {
      toast.error(err.message)
    }
  }

  function viewQR(student) {
    const qrProfile = student.student_qr_profiles?.[0]
    setQrModal({ student, qr_token: qrProfile?.qr_token, data: qrProfile })
  }

  // ── Filtrage ──────────────────────────────────────────────
  const elevesFiltres = eleves.filter(e => {
    const match = `${e.prenom} ${e.nom} ${e.unique_code}`.toLowerCase()
    if (search && !match.includes(search.toLowerCase())) return false
    if (filterClasse && e.classe_id !== filterClasse) return false
    return true
  })

  // ══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Élèves</h1>
            <SelecteurAnnee anneeActive={anneeActive} anneesDispos={anneesDispos} anneeSelectionnee={anneeSelectionnee} setAnneeSelectionnee={setAnneeSelectionnee} className="mt-1" />
            <p className="text-gray-500 text-sm">{eleves.length} élève(s) inscrit(s)</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Importer
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Ajouter un élève
            </Button>
          </div>
        </div>

        {/* ── Filtres ── */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou code…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>
          <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        {/* ── Liste ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : elevesFiltres.length === 0 ? (
          <Card>
            <EmptyState icon={Users} title="Aucun élève"
              description="Ajoutez des élèves manuellement ou importez un fichier (CSV, Excel, ODS)"
              action={
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={15} />Importer</Button>
                  <Button onClick={() => setModalOpen(true)}><Plus size={15} />Ajouter</Button>
                </div>
              } />
          </Card>
        ) : (
          <div className="space-y-2">
            {elevesFiltres.map(e => {
              const qrProfile = e.student_qr_profiles?.[0]
              const hasQR     = !!qrProfile?.qr_token
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0
                      ${e.sexe === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                      {e.prenom?.[0]}{e.nom?.[0]}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{e.prenom} {e.nom}</span>
                        <Badge color="gray">{e.classes?.nom}</Badge>
                        {hasQR && qrProfile.first_login_at && (
                          <Badge color="green"><QrCode size={10} className="inline mr-1" />QR actif</Badge>
                        )}
                        {hasQR && !qrProfile.first_login_at && (
                          <Badge color="yellow"><QrCode size={10} className="inline mr-1" />QR généré</Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">{e.unique_code}</div>
                    </div>

                    {/* Actions QR */}
                    <div className="flex items-center gap-2">
                      {hasQR ? (
                        <Button variant="secondary" size="sm" onClick={() => viewQR(e)}>
                          <Eye size={14} /> QR Code
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => genererQR(e)}>
                          <QrCode size={14} /> Générer QR
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modale ajout manuel ── */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setFormErrors({}) }} title="Nouvel élève">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
              <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
                placeholder="Fatou"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              {formErrors.prenom && <p className="text-xs text-red-500 mt-1">{formErrors.prenom}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                placeholder="Diallo"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              {formErrors.nom && <p className="text-xs text-red-500 mt-1">{formErrors.nom}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sexe *</label>
              <div className="flex gap-2">
                {['M', 'F'].map(s => (
                  <button key={s} type="button"
                    onClick={() => setForm({ ...form, sexe: s })}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all
                      ${form.sexe === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
                    {s === 'M' ? '👦 Masculin' : '👧 Féminin'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
              <input type="date" value={form.date_naissance}
                onChange={e => setForm({ ...form, date_naissance: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe *</label>
            <select value={form.classe_id} onChange={e => setForm({ ...form, classe_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
              <option value="">Sélectionner une classe</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            {formErrors.classe_id && <p className="text-xs text-red-500 mt-1">{formErrors.classe_id}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact parent</label>
            <input value={form.contact_parent} onChange={e => setForm({ ...form, contact_parent: e.target.value })}
              placeholder="+221 77 000 00 00"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={creerEleve} loading={saving}><Plus size={16} />Ajouter</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modale import CSV ── */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Importer des élèves" size="lg">
        <ImportSmart
          type="eleves"
          schoolId={schoolId}
          classes={classes}
          onSuccess={() => { setImportOpen(false); fetchEleves() }}
        />
      </Modal>

      {/* ── Modale QR Code ── */}
      <Modal isOpen={!!qrModal} onClose={() => setQrModal(null)} title="QR Code élève">
        {qrModal && (
          <QRDisplay
            student={qrModal.student}
            qrToken={qrModal.qr_token}
            qrData={qrModal.data}
            onRegenerate={() => { setQrModal(null); genererQR(qrModal.student) }}
          />
        )}
      </Modal>
    </DashboardLayout>
  )
}

// ── Composant QR Display (admin) ─────────────────────────────
function QRDisplay({ student, qrToken, qrData, onRegenerate }) {
  const canvasRef   = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (qrToken && canvasRef.current) renderQR()
  }, [qrToken])

  async function renderQR() {
    if (window.QRCode) {
      doRender()
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
      s.onload = doRender
      document.head.appendChild(s)
    }
  }

  async function doRender() {
    try {
      const url = `${window.location.origin}/login?qr=${encodeURIComponent(qrToken)}`
      await window.QRCode.toCanvas(canvasRef.current, url, {
        width: 200, margin: 2,
        color: { dark: '#1e3a5f', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      })
      setReady(true)
    } catch (err) {
      console.error(err)
    }
  }

  function downloadQR() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `qr-${student.prenom}-${student.nom}.png`.toLowerCase().replace(/\s+/g, '-')
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast.success('QR Code téléchargé !')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
        <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center font-bold text-primary-700">
          {student.prenom?.[0]}{student.nom?.[0]}
        </div>
        <div>
          <div className="font-bold text-gray-900">{student.prenom} {student.nom}</div>
          <div className="text-xs text-gray-500 font-mono">{student.unique_code}</div>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="p-4 border-2 border-primary-100 rounded-2xl bg-white shadow-sm relative">
          <canvas ref={canvasRef} className="block rounded-lg" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl">
              <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {qrData?.first_login_at ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle size={15} />
          QR activé le {new Date(qrData.first_login_at).toLocaleDateString('fr-FR')}
        </div>
      ) : (
        <div className="text-sm text-gray-500 text-center">
          Première connexion : le code élève sera demandé une fois
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onRegenerate}>
          <RefreshCw size={14} /> Régénérer
        </Button>
        <Button className="flex-1" onClick={downloadQR} disabled={!ready}>
          <Download size={14} /> Télécharger
        </Button>
      </div>
    </div>
  )
}

// Fix missing import
import { useRef } from 'react'
