// src/hooks/useAnneeActive.js
// Source centrale de vérité pour l'année scolaire active.
// - anneeActive  : l'année la plus récente (ex: "2026/2027")
// - anneesDispos : toutes les années existantes (pour le sélecteur archives)
// - setAnneeSelectionnee : permet de basculer temporairement sur une archive

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useAnneeActive() {
  const { schoolId } = useAuth()
  const [anneeActive,        setAnneeActive]        = useState(null)
  const [anneesDispos,       setAnneesDispos]        = useState([])
  const [anneeSelectionnee,  setAnneeSelectionnee]   = useState(null) // null = active
  const [loading,            setLoading]             = useState(true)

  const fetchAnnees = useCallback(async () => {
    if (!schoolId) return
    const { data } = await supabase
      .from('classes')
      .select('annee_scolaire')
      .eq('school_id', schoolId)
      .order('annee_scolaire', { ascending: false })

    const uniques = [...new Set((data || []).map(d => d.annee_scolaire).filter(Boolean))]
    setAnneesDispos(uniques)
    setAnneeActive(uniques[0] || null)
    setLoading(false)
  }, [schoolId])

  useEffect(() => { fetchAnnees() }, [fetchAnnees])

  // L'année courante à utiliser dans les requêtes
  const annee = anneeSelectionnee ?? anneeActive
  // true si on consulte une archive (pas l'année active)
  const enModeArchive = anneeSelectionnee !== null && anneeSelectionnee !== anneeActive

  return {
    anneeActive,
    annee,
    anneesDispos,
    anneeSelectionnee,
    setAnneeSelectionnee,
    enModeArchive,
    loading,
    refetch: fetchAnnees,
  }
}
