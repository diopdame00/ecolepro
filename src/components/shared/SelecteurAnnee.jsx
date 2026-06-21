// Composant réutilisable : sélecteur d'année avec badge "ARCHIVE"
// S'affiche sous forme de pills cliquables
import { Archive, BookOpen } from 'lucide-react'

export function SelecteurAnnee({ anneeActive, anneesDispos, anneeSelectionnee, setAnneeSelectionnee, className = '' }) {
  if (!anneesDispos || anneesDispos.length <= 1) return null

  const anneeEnCours = anneeSelectionnee ?? anneeActive
  const archives     = anneesDispos.filter(a => a !== anneeActive)

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Année active */}
      <button
        onClick={() => setAnneeSelectionnee(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all
          ${anneeEnCours === anneeActive
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-200 text-gray-500 hover:border-primary-300'}`}
      >
        <BookOpen size={11} />
        {anneeActive} <span className="text-[10px] font-semibold opacity-70">ACTIVE</span>
      </button>

      {/* Années archivées */}
      {archives.map(a => (
        <button
          key={a}
          onClick={() => setAnneeSelectionnee(a)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all
            ${anneeEnCours === a
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-600'}`}
        >
          <Archive size={11} />
          {a}
        </button>
      ))}
    </div>
  )
}

// Bandeau d'avertissement mode archive
export function BandeauArchive({ annee, onRetour }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Archive size={15} className="text-amber-500" />
        <span>Consultation archive — <strong>{annee}</strong> — lecture seule</span>
      </div>
      <button onClick={onRetour}
        className="text-xs font-bold text-amber-700 hover:text-amber-900 underline">
        ← Retour à l'année active
      </button>
    </div>
  )
}
