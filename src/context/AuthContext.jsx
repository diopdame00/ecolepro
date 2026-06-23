import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const PARENT_SESSION_KEY = 'ecolepro_parent_session'

export function AuthProvider({ children }) {
  const [user, setUser]                         = useState(null)
  const [profile, setProfile]                   = useState(null)
  const [parentSession, setParentSession]        = useState(null)
  const [loading, setLoading]                   = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        checkParentSession()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        setParentSession(null)
      } else if (!session) {
        setProfile(null)
        setMustChangePassword(false)
        checkParentSession()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, schools(id, name, ia, ief, logo_url, is_active, subscription_expires_at, subscription_plan, type_etablissement)')
        .eq('id', userId)
        .single()

      if (error) throw error

      if (data.role !== 'superadmin' && data.schools && !data.schools.is_active) {
        await supabase.auth.signOut()
        throw new Error('Compte école suspendu.')
      }

      setProfile(data)
      setMustChangePassword(!!data.must_change_password)
    } catch (err) {
      console.error('Erreur profil:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function checkParentSession() {
    try {
      const stored = localStorage.getItem(PARENT_SESSION_KEY)
      if (!stored) { setLoading(false); return }

      const parsed    = JSON.parse(stored)
      const token     = parsed.token
      const studentId = parsed.studentId || parsed.studentid
      if (!token || !studentId) { clearParentSession(); setLoading(false); return }

      // Nouveau schéma : validate_parent_token retourne via RPC
      const { data, error } = await supabase.rpc('validate_parent_token', { p_token: token })

      if (error || !data?.success) {
        clearParentSession()
        setLoading(false)
        return
      }

      // Enrichir la session avec les données élève + années dispo
      const student = {
        ...data.student,
        // Compatibilité avec les composants qui accèdent à student.classes.nom
        classes: { nom: data.student.classe_nom, id: data.student.classe_id },
        schools: { name: data.student.school_name, id: data.student.school_id },
      }

      setParentSession({ token, student, years: data.years || [] })
    } catch (err) {
      console.error('Erreur session parent:', err)
      clearParentSession()
    } finally {
      setLoading(false)
    }
  }

  function clearParentSession() {
    localStorage.removeItem(PARENT_SESSION_KEY)
    setParentSession(null)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Connexion parent par QR token (scan ou saisie)
  async function signInWithQR(qrToken) {
    const { data, error } = await supabase.rpc('validate_parent_token', { p_token: qrToken })
    if (error) throw new Error('QR invalide')
    if (!data?.success) throw new Error(data?.error || 'Token invalide ou expiré')

    const student = {
      ...data.student,
      classes: { nom: data.student.classe_nom, id: data.student.classe_id },
      schools: { name: data.student.school_name, id: data.student.school_id },
    }

    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify({
      token: qrToken,
      studentId: data.student.id,
    }))

    setParentSession({ token: qrToken, student, years: data.years || [] })
    return { success: true, student }
  }

  // Connexion par code unique élève
  async function signInWithCode(code) {
    // Chercher l'enrollment actif par unique_code
    const { data: studentData, error: studentErr } = await supabase
      .from('students')
      .select('id, unique_code')
      .eq('unique_code', code.toUpperCase())
      .single()

    if (studentErr || !studentData) throw new Error('Code élève introuvable')

    // Récupérer le token QR depuis l'enrollment actif
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('qr_token')
      .eq('student_id', studentData.id)
      .not('qr_token', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!enrollment?.qr_token) throw new Error('Aucun accès configuré pour cet élève')

    return signInWithQR(enrollment.qr_token)
  }

  // Forcer le changement de mot de passe
  async function changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error

    await supabase
      .from('users')
      .update({ must_change_password: false })
      .eq('id', user.id)

    setMustChangePassword(false)
    setProfile(prev => prev ? { ...prev, must_change_password: false } : prev)
    fetchProfile(user.id)
  }

  // Vérification du code temporaire admin
  async function verifyAdminCode(code) {
    const { data: userRecord, error } = await supabase
      .from('users')
      .select('id, email, temp_code, temp_code_expires_at, role, school_id')
      .eq('temp_code', code)
      .in('role', ['admin', 'secretaire', 'prof'])
      .single()

    if (error || !userRecord) throw new Error('Code temporaire introuvable ou invalide')

    if (userRecord.temp_code_expires_at && new Date(userRecord.temp_code_expires_at) < new Date()) {
      throw new Error('Ce code a expiré. Demandez une régénération au super administrateur.')
    }

    return userRecord
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearParentSession()
    setProfile(null)
    setMustChangePassword(false)
  }

  const value = {
    user,
    profile,
    parentSession,
    loading,
    mustChangePassword,
    schoolId:       profile?.school_id,
    school:         profile?.schools,
    userRole:       profile?.role,
    signIn,
    signInWithCode,
    signInWithQR,
    verifyAdminCode,
    changePassword,
    signOut,
    refreshProfile: () => user && fetchProfile(user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
