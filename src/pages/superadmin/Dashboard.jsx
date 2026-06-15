import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Badge, Button, Modal, Input } from '../../components/ui'
import { Building2, TrendingUp, AlertCircle, CheckCircle, Plus, Power, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

export const PLAN_PRICES = {
  starter:  22500,
  standard: 22500,
  premium:  22500,
}

export const PLAN_LABELS = {
  starter:  'Starter',
  standard: 'Standard',
  premium:  'Premium',
}

export default function SuperAdminDashboard() {
  const [ecoles, setEcoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [newEcole, setNewEcole] = useState({
    name: '', director_name: '', director_email: '', phone: '', subscription_plan: 'standard',
  })
  const [creating, setCreating] = useState(false)
  const [tempPassword, setTempPassword] = useState(null)

  useEffect(() => { fetchEcoles() }, [])

  async function fetchEcoles() {
    const { data, error } = await supabase
      .from('schools')
      // Champs autorisés au Super Admin uniquement (cf. cahier des charges :
      // aucun accès aux données pédagogiques/financières des écoles)
      .select('id, name, director_name, director_email, phone, is_active, subscription_plan, subscription_expires_at, created_at')
      .order('created_at', { ascending: false })

    if (!error) setEcoles(data || [])
    setLoading(false)
  }

  async function toggleEcole(id, currentStatus) {
    const { error } = await supabase
      .from('schools')
      .update({ is_active: !currentStatus })
      .eq('id', id)

    if (error) { toast.error('Erreur lors de la mise à jour'); return }
    toast.success(currentStatus ? 'École désactivée' : 'École activée')
    fetchEcoles()
  }

  async function creerEcole() {
    if (!newEcole.name || !newEcole.director_name || !newEcole.director_email) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    setCreating(true)
    try {
      // Passe par l'Edge Function "create-school" — la création de compte
      // (auth.admin.createUser) nécessite la clé service_role qui ne doit
      // JAMAIS être exposée côté client.
      const { data, error } = await supabase.functions.invoke('create-school', {
        body: newEcole,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setTempPassword(data.tempPassword)
      toast.success('École créée avec succès !')
      setNewEcole({ name: '', director_name: '', director_email: '', phone: '', subscription_plan: 'standard' })
      fetchEcoles()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  function fermerModal() {
    setModalOpen(false)
    setTempPassword(null)
  }

  function copierMotDePasse() {
    navigator.clipboard.writeText(tempPassword)
    toast.success('Mot de passe copié')
  }

  const ecolesActives = ecoles.filter(e => e.is_active)
  const ecolesSuspendues = ecoles.filter(e => !e.is_active)
  const revenuMensuel = ecolesActives.reduce((acc, e) => acc + (PLAN_PRICES[e.subscription_plan] || PLAN_PRICES.standard), 0)
  const revenuAnnuel = revenuMensuel * 12

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestion des écoles clientes</p>
        </div>

        {/* Stats financières */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Écoles actives</p>
                <p className="text-3xl font-black text-gray-900 mt-1">{ecolesActives.length}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle size={20} className="text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Suspendues</p>
                <p className="text-3xl font-black text-gray-900 mt-1">{ecolesSuspendues.length}</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={20} className="text-red-500" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenu mensuel</p>
                <p className="text-2xl font-black text-primary-700 mt-1">
                  {revenuMensuel.toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-gray-400">F CFA</p>
              </div>
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <TrendingUp size={20} className="text-primary-600" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenu annuel</p>
                <p className="text-2xl font-black text-primary-700 mt-1">
                  {revenuAnnuel.toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-gray-400">F CFA (projection)</p>
              </div>
              <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center">
                <TrendingUp size={20} className="text-accent" />
              </div>
            </div>
          </Card>
        </div>

        {/* Liste des écoles */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={18} className="text-primary-600" />
              Toutes les écoles
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : ecoles.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Aucune école enregistrée</p>
              <p className="text-sm">Créez votre première école ci-dessus</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ecoles.map(ecole => {
                const expire = ecole.subscription_expires_at ? new Date(ecole.subscription_expires_at) : null
                const expireSoon = expire && (expire - new Date()) < 7 * 24 * 60 * 60 * 1000

                return (
                  <div key={ecole.id} className="px-6 py-4 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center font-bold text-primary-700 text-sm shrink-0">
                        {ecole.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{ecole.name}</p>
                        <p className="text-xs text-gray-400">
                          {ecole.director_name} · {ecole.director_email}
                          {ecole.phone ? ` · ${ecole.phone}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold text-primary-700">
                          {(PLAN_PRICES[ecole.subscription_plan] || PLAN_PRICES.standard).toLocaleString('fr-FR')} F CFA
                        </p>
                        <p className="text-xs text-gray-400">
                          {PLAN_LABELS[ecole.subscription_plan] || 'Standard'} · par mois
                        </p>
                      </div>
                      {expire && (
                        <Badge color={expireSoon ? 'red' : 'gray'}>
                          Exp. {expire.toLocaleDateString('fr-FR')}
                        </Badge>
                      )}
                      <Badge color={ecole.is_active ? 'green' : 'red'}>
                        {ecole.is_active ? 'Actif' : 'Suspendu'}
                      </Badge>
                      <Button
                        variant={ecole.is_active ? 'danger' : 'success'}
                        size="sm"
                        onClick={() => toggleEcole(ecole.id, ecole.is_active)}
                      >
                        <Power size={14} />
                        {ecole.is_active ? 'Suspendre' : 'Activer'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Modal nouvelle école */}
      <Modal isOpen={modalOpen} onClose={fermerModal} title="Créer une nouvelle école">
        {tempPassword ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <CheckCircle size={32} className="text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800 mb-1">École créée avec succès !</p>
              <p className="text-sm text-green-700 mb-3">
                Voici le mot de passe provisoire du directeur. Il devra le modifier à sa première connexion.
              </p>
              <div className="flex items-center justify-center gap-2 bg-white rounded-lg px-3 py-2 border border-green-200">
                <code className="font-mono font-bold text-gray-800">{tempPassword}</code>
                <button onClick={copierMotDePasse} className="p-1 hover:bg-gray-100 rounded">
                  <Copy size={14} className="text-gray-500" />
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={fermerModal}>Terminé</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Nom de l'école *"
              placeholder="ex: École Sainte-Marie"
              value={newEcole.name}
              onChange={e => setNewEcole({ ...newEcole, name: e.target.value })}
            />
            <Input
              label="Nom du directeur *"
              placeholder="Moussa Diallo"
              value={newEcole.director_name}
              onChange={e => setNewEcole({ ...newEcole, director_name: e.target.value })}
            />
            <Input
              label="Email du directeur *"
              type="email"
              placeholder="directeur@ecole.sn"
              value={newEcole.director_email}
              onChange={e => setNewEcole({ ...newEcole, director_email: e.target.value })}
            />
            <Input
              label="Téléphone"
              placeholder="+221 77 000 00 00"
              value={newEcole.phone}
              onChange={e => setNewEcole({ ...newEcole, phone: e.target.value })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formule d'abonnement</label>
              <select
                value={newEcole.subscription_plan}
                onChange={e => setNewEcole({ ...newEcole, subscription_plan: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Object.entries(PLAN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} — {PLAN_PRICES[value].toLocaleString('fr-FR')} F CFA/mois
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
              Un mot de passe provisoire sécurisé sera généré automatiquement et affiché une seule fois.
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={fermerModal}>
                Annuler
              </Button>
              <Button className="flex-1" loading={creating} onClick={creerEcole}>
                Créer l'école
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  )
}
