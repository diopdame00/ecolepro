import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAnneeActive } from '../../hooks/useAnneeActive'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card, Button } from '../../components/ui'
import { GraduationCap, AlertTriangle, CheckCircle, ArrowRight, Loader } from 'lucide-react'
import toast from 'react-hot-toast'

export default function NouvelleAnneePage() {
  const { schoolId } = useAuth()
  const { anneeActive, yearIdActive, refetch } = useAnneeActive()
  const navigate = useNavigate()

  const [confirmText, setConfirmText] = useState('')
  const [applying, setApplying]       = useState(false)
  const [done, setDone]               = useState(null)

  // Calculer la nouvelle année à afficher
  function calcNouvelleAnnee(annee) {
    if (!annee) return '—'
    const fin = annee.split('/')[1]
    if (!fin) return '—'
    return `${fin}/${parseInt(fin) + 1}`
  }

  const nouvelleAnnee = calcNouvelleAnnee(anneeActive)
  const confirmRequired = `CONFIRMER ${nouvelleAnnee}`

  async function cloturerEtCreer() {
    if (confirmText !== confirmRequired) {
      toast.error(`Tapez exactement : ${confirmRequired}`)
      return
    }
    setApplying(true)
    try {
      // Appeler l'Edge Function cloturer-annee
      const session = (await import('../../lib/supabase')).supabase.auth.getSession
      const { data: { session: s } } = await (await import('../../lib/supabase')).supabase.auth.getSession()
      const token = s?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloturer-annee`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ school_id: schoolId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur serveur')

      setDone(data)
      await refetch()
      toast.success(`Année ${data.annee_cloturee} clôturée !`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setApplying(false)
    }
  }

  if (done) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Année clôturée !</h1>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-left space-y-2">
            <p className="text-sm text-green-800">
              ✅ Année <strong>{done.annee_cloturee}</strong> archivée
            </p>
            <p className="text-sm text-green-800">
              ✅ Nouvelle année <strong>{done.nouvelle_annee}</strong> créée
            </p>
            <p className="text-sm text-green-800">
              ✅ <strong>{done.classes_creees}</strong> classes et matières dupliquées
            </p>
          </div>
          <p className="text-sm text-gray-500">
            Les élèves ne sont pas réinscrits automatiquement — faites-le manuellement dans la page Élèves.
          </p>
          <Button onClick={() => navigate('/admin/eleves')} className="w-full">
            <ArrowRight size={16} /> Aller inscrire les élèves
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GraduationCap size={32} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Passage à la nouvelle année</h1>
          <p className="text-gray-500 text-sm mt-1">
            Année active : <strong>{anneeActive}</strong> → <strong>{nouvelleAnnee}</strong>
          </p>
        </div>

        {/* Ce qui va se passer */}
        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-gray-900">Ce qui sera fait automatiquement</h2>
          {[
            `L'année ${anneeActive} sera archivée (données conservées)`,
            `L'année ${nouvelleAnnee} sera créée et activée`,
            'Toutes les classes seront dupliquées avec leurs matières',
            "L'emploi du temps sera copié",
            'Les élèves ne seront PAS réinscrits automatiquement',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle size={15} className="text-green-500 mt-0.5 shrink-0" />
              {item}
            </div>
          ))}
        </Card>

        {/* Avertissement */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            Cette action est <strong>irréversible</strong>. L'année {anneeActive} sera définitivement clôturée.
            Assurez-vous que toutes les notes et paiements sont à jour avant de continuer.
          </p>
        </div>

        {/* Confirmation */}
        <Card className="p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            Pour confirmer, tapez exactement :
          </p>
          <code className="block bg-gray-100 rounded-xl px-4 py-2 text-sm font-mono text-gray-800">
            {confirmRequired}
          </code>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={confirmRequired}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button
            className="w-full"
            loading={applying}
            disabled={confirmText !== confirmRequired}
            onClick={cloturerEtCreer}
          >
            {applying ? <Loader size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Clôturer {anneeActive} et créer {nouvelleAnnee}
          </Button>
        </Card>
      </div>
    </DashboardLayout>
  )
}
