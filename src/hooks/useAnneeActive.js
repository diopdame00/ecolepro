// src/hooks/useAnneeActive.js
// Retourne l'année scolaire la plus récente parmi les classes de l'école.
// Utilisé par les pages prof pour filtrer uniquement l'année active.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useAnneeActive() {
  const { schoolId } = useAuth()
  const [anneeActive, setAnneeActive] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) return
    async function fetch() {
      const { data } = await supabase
        .from('classes')
        .select('annee_scolaire')
        .eq('school_id', schoolId)
        .order('annee_scolaire', { ascending: false })
        .limit(1)
        .single()
      setAnneeActive(data?.annee_scolaire || null)
      setLoading(false)
    }
    fetch()
  }, [schoolId])

  return { anneeActive, loading }
}
