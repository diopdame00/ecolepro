import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

export default function NonAutorise() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldX size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Accès refusé</h1>
        <p className="text-gray-500 mt-2 mb-6">Vous n'avez pas la permission d'accéder à cette page.</p>
        <button
          onClick={() => navigate(-1)}
          className="btn-primary"
        >
          Retour
        </button>
      </div>
    </div>
  )
}
