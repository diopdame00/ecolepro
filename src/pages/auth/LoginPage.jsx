import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  GraduationCap, Eye, EyeOff, KeyRound, Mail,
  QrCode, Camera, Upload, ArrowLeft, Lock, AlertCircle, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Validation Zod-like (sans librairie externe) ──────────────
function validatePassword(pwd) {
  const errors = []
  if (pwd.length < 8)              errors.push('8 caractères minimum')
  if (!/[A-Z]/.test(pwd))          errors.push('1 majuscule')
  if (!/[0-9]/.test(pwd))          errors.push('1 chiffre')
  if (!/[!@#$%^&*]/.test(pwd))     errors.push('1 caractère spécial (!@#$%^&*)')
  return errors
}

// ── Lecteur QR via jsQR (CDN chargé dynamiquement) ───────────
async function loadJsQR() {
  if (window.jsQR) return window.jsQR
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return window.jsQR
}

async function decodeQRFromFile(file) {
  const jsQR = await loadJsQR()
  const img  = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width  = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, img.width, img.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  return code?.data || null
}

async function decodeQRFromCamera(videoEl) {
  const jsQR = await loadJsQR()
  const canvas = document.createElement('canvas')
  canvas.width  = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  return code?.data || null
}

// ══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { signIn, signInWithCode, signInWithQR, activateQRFirstLogin, mustChangePassword, changePassword, user, profile, loading: authLoading } = useAuth()
  const navigate  = useNavigate()

  // Modes : 'email' | 'admin_code' | 'admin_code_pwd' | 'code' | 'qr_choice' | 'qr_scan' | 'qr_upload' | 'qr_activate' | 'force_change'
  const [mode, setMode]       = useState('email')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  // Email login
  const [form, setForm] = useState({ email: '', password: '', code: '', adminCode: '', adminTempPwd: '' })

  // Admin temp code flow
  const [adminCodeVerified, setAdminCodeVerified] = useState(null)

  // Force change password
  const [pwdForm, setPwdForm]     = useState({ newPwd: '', confirmPwd: '' })
  const [pwdErrors, setPwdErrors] = useState([])

  // QR flow
  const [qrPending, setQrPending] = useState(null) // { qrToken, studentId }
  const [activCode, setActivCode] = useState('')
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const rafRef     = useRef(null)
  const fileRef    = useRef(null)

  // ── Afficher force-change si nécessaire
  const effectiveMode = mustChangePassword ? 'force_change' : mode

  // ── Redirection auto quand le profil est chargé ─────────
  useEffect(() => {
    if (!authLoading && profile && mode === 'email') {
      const routes = {
        superadmin: '/superadmin',
        admin:      '/admin',
        secretaire: '/secretaire',
        prof:       '/prof',
        surveillant:'/surveillant',
      }
      const dest = routes[profile.role]
      if (dest) navigate(dest, { replace: true })
    }
  }, [profile, loading])

  // ── Email login ───────────────────────────────────────────
  async function handleEmailLogin(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(form.email, form.password)
      toast.success('Connexion réussie !')
      // La navigation se fait via useEffect quand le profil est chargé
    } catch {
      toast.error('Email ou mot de passe incorrect')
      setLoading(false)
    }
    // Ne pas mettre setLoading(false) ici — le useEffect navigue et démonte le composant
  }

  // ── Code élève ───────────────────────────────────────────
  async function handleCodeLogin(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const session = await signInWithCode(form.code)
      navigate(`/parent/${session.student_id}`)
    } catch {
      toast.error('Code introuvable. Vérifiez et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  // ── QR : scan caméra ─────────────────────────────────────
  async function startCamera() {
    setMode('qr_scan')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream
      // Attendre que le composant soit monté
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          scanLoop()
        }
      }, 200)
    } catch {
      toast.error('Caméra inaccessible. Utilisez l\'upload à la place.')
      setMode('qr_choice')
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function scanLoop() {
    rafRef.current = requestAnimationFrame(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        scanLoop(); return
      }
      const token = await decodeQRFromCamera(videoRef.current)
      if (token) {
        stopCamera()
        await handleQRToken(token)
      } else {
        scanLoop()
      }
    })
  }

  function cancelQR() {
    stopCamera()
    setMode('qr_choice')
  }

  // ── QR : upload image ─────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const token = await decodeQRFromFile(file)
      if (!token) { toast.error('Aucun QR Code détecté dans l\'image'); return }
      await handleQRToken(token)
    } catch {
      toast.error('Impossible de lire l\'image')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── QR : traitement token ────────────────────────────────
  async function handleQRToken(token) {
    setLoading(true)
    try {
      const result = await signInWithQR(token)
      if (result.requiresActivation) {
        setQrPending({ qrToken: token, studentId: result.studentId })
        setMode('qr_activate')
      } else {
        toast.success(`Bienvenue ${result.student?.prenom} !`)
        navigate(`/parent/${result.student.id}`)
      }
    } catch (err) {
      toast.error(err.message || 'QR Code invalide')
      setMode('qr_choice')
    } finally {
      setLoading(false)
    }
  }

  // ── QR : activation première connexion ───────────────────
  async function handleActivation(e) {
    e.preventDefault()
    if (!activCode.trim()) { toast.error('Entrez votre code d\'activation'); return }
    setLoading(true)
    try {
      const result = await activateQRFirstLogin(qrPending.qrToken, activCode)
      toast.success(`Bienvenue ${result.student?.prenom} !`)
      navigate(`/parent/${result.student.id}`)
    } catch (err) {
      toast.error(err.message || 'Code d\'activation incorrect')
    } finally {
      setLoading(false)
    }
  }

  // ── Connexion par code temporaire admin ──────────────────
  async function handleAdminCodeLogin(e) {
    e.preventDefault()
    if (!form.adminCode?.trim()) { toast.error('Entrez votre code temporaire'); return }
    setLoading(true)
    try {
      const { data: userRecord, error } = await supabase
        .from('users')
        .select('id, email, temp_code, temp_code_expires_at, role, school_id')
        .eq('temp_code', form.adminCode.trim().toUpperCase())
        .in('role', ['admin', 'secretaire', 'prof', 'surveillant'])
        .single()

      if (error || !userRecord) {
        throw new Error('Code temporaire introuvable ou invalide')
      }
      if (userRecord.temp_code_expires_at && new Date(userRecord.temp_code_expires_at) < new Date()) {
        throw new Error('Ce code a expiré. Demandez une régénération au super administrateur.')
      }
      setAdminCodeVerified(userRecord)
      setMode('admin_code_pwd')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdminCodePwdLogin(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(adminCodeVerified.email, form.adminTempPwd)
      toast.success('Connexion réussie !')
    } catch {
      toast.error('Mot de passe provisoire incorrect')
      setLoading(false)
    }
  }


  async function handleChangePassword(e) {
    e.preventDefault()
    const errors = validatePassword(pwdForm.newPwd)
    if (errors.length) { setPwdErrors(errors); return }
    if (pwdForm.newPwd !== pwdForm.confirmPwd) {
      setPwdErrors(['Les mots de passe ne correspondent pas']); return
    }
    setLoading(true)
    try {
      await changePassword(pwdForm.newPwd)
      toast.success('Mot de passe mis à jour !')
      // Rediriger directement vers la bonne page selon le rôle
      const role = profile?.role
      const routes = {
        admin:      '/admin',
        prof:       '/prof',
        secretaire: '/secretaire',
        superadmin: '/superadmin',
      }
      navigate(routes[role] || '/', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Erreur lors du changement')
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-600 to-blue-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <GraduationCap size={32} className="text-primary-600" />
          </div>
          <h1 className="text-3xl font-black text-white">
            Ecole<span className="text-yellow-400">Pro</span>
          </h1>
          <p className="text-blue-200 text-sm mt-1">Gestion Scolaire Intelligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* ── FORCE CHANGE PASSWORD ── */}
          {effectiveMode === 'force_change' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Lock size={20} className="text-orange-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Première connexion</h2>
                  <p className="text-xs text-gray-500">Définissez votre nouveau mot de passe</p>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-5 text-sm text-orange-800">
                Pour votre sécurité, vous devez changer le mot de passe provisoire avant de continuer.
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      placeholder="Minimum 8 caractères"
                      value={pwdForm.newPwd}
                      onChange={e => { setPwdForm({ ...pwdForm, newPwd: e.target.value }); setPwdErrors([]) }}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {/* Règles visuelles */}
                  <div className="mt-2 space-y-1">
                    {[
                      ['8 caractères minimum', pwdForm.newPwd.length >= 8],
                      ['1 majuscule',          /[A-Z]/.test(pwdForm.newPwd)],
                      ['1 chiffre',            /[0-9]/.test(pwdForm.newPwd)],
                      ['1 caractère spécial',  /[!@#$%^&*]/.test(pwdForm.newPwd)],
                    ].map(([rule, ok]) => (
                      <div key={rule} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
                        <CheckCircle2 size={12} className={ok ? 'opacity-100' : 'opacity-30'} />
                        {rule}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    placeholder="Répétez le mot de passe"
                    value={pwdForm.confirmPwd}
                    onChange={e => { setPwdForm({ ...pwdForm, confirmPwd: e.target.value }); setPwdErrors([]) }}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {pwdErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    {pwdErrors.map(e => (
                      <div key={e} className="flex items-center gap-1.5 text-xs text-red-700">
                        <AlertCircle size={12} /> {e}
                      </div>
                    ))}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Enregistrer le mot de passe
                </button>
              </form>
            </div>
          )}

          {/* ── EMAIL LOGIN ── */}
          {effectiveMode === 'email' && (
            <>
              <Tabs mode={mode} setMode={setMode} />
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse email</label>
                  <input type="email" required placeholder="directeur@monecole.sn"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} required placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <SubmitBtn loading={loading}>Se connecter</SubmitBtn>
              </form>
              {/* Lien première connexion */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setMode('admin_code')}
                  className="text-sm text-primary-600 hover:text-primary-800 font-medium underline underline-offset-2">
                  Première connexion ? Utilisez votre code temporaire
                </button>
              </div>
            </>
          )}

          {/* ── CODE TEMPORAIRE ADMIN (étape 1 : saisie du code) ── */}
          {effectiveMode === 'admin_code' && (
            <div>
              <BackBtn onClick={() => setMode('email')} />
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <KeyRound size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Première connexion</h2>
                  <p className="text-xs text-gray-500">Entrez le code temporaire reçu du super admin</p>
                </div>
              </div>
              <form onSubmit={handleAdminCodeLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code temporaire</label>
                  <input type="text" required placeholder="ECO-XXXX-XXXX"
                    value={form.adminCode}
                    onChange={e => setForm({ ...form, adminCode: e.target.value.toUpperCase() })}
                    maxLength={12}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase" />
                </div>
                <SubmitBtn loading={loading}>Vérifier le code</SubmitBtn>
              </form>
            </div>
          )}

          {/* ── CODE TEMPORAIRE ADMIN (étape 2 : saisie du mot de passe provisoire) ── */}
          {effectiveMode === 'admin_code_pwd' && adminCodeVerified && (
            <div>
              <BackBtn onClick={() => { setMode('admin_code'); setAdminCodeVerified(null) }} />
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Code vérifié !</h2>
                  <p className="text-xs text-gray-500">Entrez maintenant votre mot de passe provisoire</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-800">
                Connexion pour <strong>{adminCodeVerified.email}</strong>
              </div>
              <form onSubmit={handleAdminCodePwdLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe provisoire</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} required placeholder="Mot de passe reçu du super admin"
                      value={form.adminTempPwd}
                      onChange={e => setForm({ ...form, adminTempPwd: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12" />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <SubmitBtn loading={loading}>Se connecter</SubmitBtn>
              </form>
            </div>
          )}

          {/* ── CODE ÉLÈVE ── */}
          {effectiveMode === 'code' && (
            <>
              <Tabs mode={mode} setMode={setMode} />
              <form onSubmit={handleCodeLogin} className="space-y-4">
                <p className="text-sm text-gray-500 text-center">Entrez le code reçu à la rentrée scolaire</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code élève</label>
                  <input type="text" required placeholder="ex: ECO-2025-X7K2"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    maxLength={14}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase" />
                </div>
                <SubmitBtn loading={loading}>Voir les notes</SubmitBtn>
                <div className="relative flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">ou</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <button type="button" onClick={() => setMode('qr_choice')}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary-300 rounded-xl text-primary-600 font-semibold text-sm hover:bg-primary-50 transition-colors">
                  <QrCode size={18} />
                  Connexion par QR Code
                </button>
              </form>
            </>
          )}

          {/* ── QR : CHOIX MÉTHODE ── */}
          {effectiveMode === 'qr_choice' && (
            <div>
              <BackBtn onClick={() => setMode('code')} />
              <h2 className="text-lg font-bold text-gray-900 mb-1">Connexion QR Code</h2>
              <p className="text-sm text-gray-500 mb-6">Scannez votre QR Code personnel ou importez une photo</p>
              <div className="space-y-3">
                <button onClick={startCamera}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all group">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                    <Camera size={24} className="text-primary-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Scanner avec la caméra</div>
                    <div className="text-xs text-gray-500">Pointez la caméra vers le QR Code</div>
                  </div>
                </button>

                <button onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all group">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <Upload size={24} className="text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Importer depuis la galerie</div>
                    <div className="text-xs text-gray-500">Sélectionnez une photo du QR Code</div>
                  </div>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>
              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  Lecture du QR Code…
                </div>
              )}
            </div>
          )}

          {/* ── QR : SCAN CAMÉRA ── */}
          {effectiveMode === 'qr_scan' && (
            <div>
              <BackBtn onClick={cancelQR} />
              <h2 className="text-lg font-bold text-gray-900 mb-4">Scanner le QR Code</h2>
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square mb-4">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                {/* Viseur */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-4 border-white rounded-2xl opacity-80">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-lg" />
                  </div>
                </div>
                {/* Ligne de scan animée */}
                <div className="absolute inset-x-8 h-0.5 bg-primary-400 opacity-70 animate-[scan_2s_ease-in-out_infinite]"
                  style={{ animation: 'scan 2s ease-in-out infinite', top: '50%' }} />
              </div>
              <p className="text-sm text-gray-500 text-center">Centrez le QR Code dans le cadre</p>
            </div>
          )}

          {/* ── QR : ACTIVATION PREMIÈRE CONNEXION ── */}
          {effectiveMode === 'qr_activate' && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <KeyRound size={20} className="text-yellow-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Première utilisation</h2>
                  <p className="text-xs text-gray-500">Entrez votre code d'activation pour continuer</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-sm text-blue-800">
                Ce code unique vous a été remis lors de votre inscription. Il ne sera demandé qu'une seule fois.
              </div>

              <form onSubmit={handleActivation} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code d'activation élève</label>
                  <input type="text" required placeholder="ex: ECO-2025-X7K2"
                    value={activCode}
                    onChange={e => setActivCode(e.target.value.toUpperCase())}
                    maxLength={14}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase" />
                </div>
                <SubmitBtn loading={loading}>Activer et accéder</SubmitBtn>
              </form>
            </div>
          )}

        </div>

        <p className="text-center text-blue-200 text-xs mt-6">© 2025 EcolePro — ecolepro.site</p>
      </div>

      {/* Style animation scan */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 30%; }
          50% { top: 70%; }
        }
      `}</style>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────
function Tabs({ mode, setMode }) {
  return (
    <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
      {[
        { id: 'email', icon: Mail,     label: 'Équipe école' },
        { id: 'code',  icon: KeyRound, label: 'Parent / Élève' },
      ].map(({ id, icon: Icon, label }) => (
        <button key={id}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all
            ${mode === id ? 'bg-white shadow text-primary-700' : 'text-gray-500'}`}
          onClick={() => setMode(id)}>
          <Icon size={16} />{label}
        </button>
      ))}
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
      <ArrowLeft size={16} /> Retour
    </button>
  )
}

function SubmitBtn({ loading, children }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
      {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
