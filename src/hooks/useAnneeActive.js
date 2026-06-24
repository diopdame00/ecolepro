// src/hooks/useAnneeActive.js
// Source centrale de vérité pour l'année scolaire active.
// Nouveau schéma : utilise academic_years + year_id (UUID)
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useAnneeActive() {
  const { schoolId } = useAuth()
  const [anneeActive,       setAnneeActive]       = useState(null)   // "2025/2026"
  const [yearIdActive,      setYearIdActive]       = useState(null)   // UUID
  const [anneesDispos,      setAnneesDispos]       = useState([])     // [{id, annee, is_active}]
  const [anneeSelectionnee, setAnneeSelectionnee]  = useState(null)   // null = active
  const [yearIdSelectionne, setYearIdSelectionne]  = useState(null)   // UUID sélectionné
  const [loading,           setLoading]            = useState(true)

  const fetchAnnees = useCallback(async () => {
    if (!schoolId) return
    const { data } = await supabase
      .from('academic_years')
      .select('id, annee, is_active, date_debut, date_fin')
      .eq('school_id', schoolId)
      .order('annee', { ascending: false })

    const liste = data || []
    setAnneesDispos(liste)

    const active = liste.find(a => a.is_active) || liste[0]
    if (active) {
      setAnneeActive(active.annee)
      setYearIdActive(active.id)
    }
    setLoading(false)
  }, [schoolId])

  useEffect(() => { fetchAnnees() }, [fetchAnnees])

  // Basculer sur une année archivée
  function choisirAnnee(yearId) {
    const trouvee = anneesDispos.find(a => a.id === yearId)
    if (!trouvee) return
    if (trouvee.is_active) {
      setAnneeSelectionnee(null)
      setYearIdSelectionne(null)
    } else {
      setAnneeSelectionnee(trouvee.annee)
      setYearIdSelectionne(trouvee.id)
    }
  }

  function retourAnneeActive() {
    setAnneeSelectionnee(null)
    setYearIdSelectionne(null)
  }

  // Valeurs courantes à utiliser dans les requêtes
  const annee   = anneeSelectionnee ?? anneeActive
  const yearId  = yearIdSelectionne ?? yearIdActive
  const enModeArchive = anneeSelectionnee !== null

  return {
    // Valeurs courantes (actives ou archive)
    annee, yearId,
    // Année active réelle
    anneeActive, yearIdActive,
    // Toutes les années disponibles
    anneesDispos,
    // Sélection archive
    anneeSelectionnee, yearIdSelectionne,
    setAnneeSelectionnee: choisirAnnee,
    retourAnneeActive,
    enModeArchive,
    loading,
    refetch: fetchAnnees,
  }
}
