import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const PARENT_SESSION_KEY = 'ecolepro_parent_session'

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null)
  const [profile, setProfile]           = useState(null)
  const [parentSession, setParentSession] = useState(null)
  const [loading, setLoading]           = useState(true)
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
      // Déclencher le flux force-change si nécessaire
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
      // Compatibilité : ancienne clé "studentid" (minuscule) → "studentId"
      const token     = parsed.token
      const studentId = parsed.studentId || parsed.studentid
      if (!token || !studentId) { clearParentSession(); setLoading(false); return }
      // Réécrire proprement si la casse était incorrecte
      if (!parsed.studentId) {
        localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify({ token, studentId }))
      }

      const { data, error } = await supabase.rpc('verify_parent_session', { p_token: token })

      if (error || !data?.[0]?.is_valid) {
        clearParentSession()
        setLoading(false)
        return
      }

      const { data: student } = await supabase
        .from('students')
        .select('id, prenom, nom, unique_code, classe_id, classes(nom), schools(name, logo_url)')
        .eq('id', data[0].student_id)
        .single()

      setParentSession({ token, student })
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

  // Connexion par code élève (texte)
  async function signInWithCode(code) {
    const { data, error } = await supabase.rpc('login_parent_by_code', { p_code: code.toUpperCase() })
    if (error || !data?.[0]) throw new Error('Code introuvable')

    const session = data[0]
    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify({
      token: session.token,
      studentId: session.student_id,
    }))

    const { data: student } = await supabase
      .from('students')
      .select('id, prenom, nom, unique_code, classe_id, classes(nom), schools(name, logo_url)')
      .eq('id', session.student_id)
      .single()

    setParentSession({ token: session.token, student })
    return session
  }

  // NOUVEAU : Connexion par QR token (scan caméra ou upload image)
  async function signInWithQR(qrToken) {
    const { data, error } = await supabase.rpc('login_by_qr_token', { p_qr_token: qrToken })
    if (error) throw new Error('QR invalide')

    if (!data.success) {
      // Première connexion : retourner l'info pour afficher le formulaire d'activation
      if (data.requires_activation) {
        return { requiresActivation: true, studentId: data.student_id, qrToken }
      }
      throw new Error(data.error || 'QR invalide')
    }

    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify({
      token: data.token,
      studentId: data.student_id,
    }))

    const { data: student } = await supabase
      .from('students')
      .select('id, prenom, nom, unique_code, classe_id, classes(nom), schools(name, logo_url)')
      .eq('id', data.student_id)
      .single()

    setParentSession({ token: data.token, student })
    return { success: true, student }
  }

  // NOUVEAU : Activation première connexion QR
  async function activateQRFirstLogin(qrToken, activationCode) {
    const { data, error } = await supabase.rpc('activate_qr_first_login', {
      p_qr_token:       qrToken,
      p_activation_code: activationCode.toUpperCase(),
    })
    if (error || !data?.success) throw new Error(data?.error || 'Code incorrect')

    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify({
      token: data.token,
      studentId: data.student_id,
    }))

    const { data: student } = await supabase
      .from('students')
      .select('id, prenom, nom, unique_code, classe_id, classes(nom), schools(name, logo_url)')
      .eq('id', data.student_id)
      .single()

    setParentSession({ token: data.token, student })
    return { success: true, student }
  }

  // NOUVEAU : Forcer le changement de mot de passe
  async function changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error

    // Mettre à jour directement la colonne en DB
    await supabase
      .from('users')
      .update({
        must_change_password: false,
        password_changed_at:  new Date().toISOString(),
      })
      .eq('id', user.id)

    // Forcer le state AVANT fetchProfile pour éviter la boucle
    setMustChangePassword(false)
    setProfile(prev => prev ? { ...prev, must_change_password: false } : prev)

    // Recharger le profil en arrière-plan
    fetchProfile(user.id)
  }

  // Vérification du code temporaire admin (première connexion)
  async function verifyAdminCode(code) {
    const { data: userRecord, error } = await supabase
      .from('users')
      .select('id, email, temp_code, temp_code_expires_at, role, school_id')
      .eq('temp_code', code)
      .in('role', ['admin', 'secretaire', 'prof', 'surveillant'])
      .single()

    if (error || !userRecord) {
      throw new Error('Code temporaire introuvable ou invalide')
    }

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
    schoolId:  profile?.school_id,
    school:    profile?.schools,
    userRole:  profile?.role,
    signIn,
    signInWithCode,
    signInWithQR,
    activateQRFirstLogin,
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
