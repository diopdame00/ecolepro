import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { QrCode, Download, RefreshCw, User, School, BookOpen, Share2, CheckCircle, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'

// Charger la librairie QRCode dynamiquement (CDN)
async function loadQRLib() {
  if (window.QRCode) return window.QRCode
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
    s.onload  = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return window.QRCode
}

// ══════════════════════════════════════════════════════════════
export default function MonProfil() {
  const { parentSession } = useAuth()
  const [qrData, setQrData] = useState(null)      // { qr_token, qr_generated_at, classe_nom, school_name }
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [qrReady, setQrReady] = useState(false)
  const canvasRef = useRef(null)
  const student   = parentSession?.student

  useEffect(() => {
    if (student?.id) fetchQrProfile()
  }, [student?.id])

  useEffect(() => {
    if (qrData?.qr_token && canvasRef.current) {
      renderQR(qrData.qr_token)
    }
  }, [qrData?.qr_token])

  async function fetchQrProfile() {
    setLoading(true)
    const { data } = await supabase
      .from('student_qr_view')
      .select('*')
      .eq('student_id', student.id)
      .single()
    setQrData(data)
    setLoading(false)
  }

  async function renderQR(token) {
    try {
      const QRCode = await loadQRLib()
      const canvas = canvasRef.current
      if (!canvas) return
      
      // URL que le QR Code encodera (deep link vers l'app)
      const qrContent = `${window.location.origin}/login?qr=${encodeURIComponent(token)}`

      await QRCode.toCanvas(canvas, qrContent, {
        width: 240,
        margin: 2,
        color: {
          dark:  '#1e3a5f',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // High — permet logo au centre
      })
      setQrReady(true)
    } catch (err) {
      console.error('QR render error:', err)
    }
  }

  // ── Générer / régénérer le QR Code ───────────────────────
  async function genererQR() {
    if (!confirm('Régénérer votre QR Code ? L\'ancien ne fonctionnera plus.')) return
    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('generate_student_qr', {
        p_student_id: student.id,
      })
      if (error || !data?.success) throw new Error(data?.error || 'Erreur')
      toast.success('QR Code régénéré !')
      await fetchQrProfile()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Télécharger le QR Code ───────────────────────────────
  function downloadQR() {
    const canvas = canvasRef.current
    if (!canvas || !qrReady) { toast.error('QR Code non disponible'); return }

    // Créer une version avec fond blanc + identité
    const finalCanvas = document.createElement('canvas')
    const padding     = 32
    const infoHeight  = 80
    finalCanvas.width  = canvas.width  + padding * 2
    finalCanvas.height = canvas.height + padding * 2 + infoHeight
    const ctx = finalCanvas.getContext('2d')

    // Fond blanc
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

    // QR Code centré
    ctx.drawImage(canvas, padding, padding)

    // Zone identité
    const y = canvas.height + padding + 12
    ctx.fillStyle = '#1e3a5f'
    ctx.font      = 'bold 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${student.prenom} ${student.nom}`, finalCanvas.width / 2, y)

    ctx.fillStyle = '#64748b'
    ctx.font      = '12px system-ui, sans-serif'
    ctx.fillText(`${qrData?.classe_nom || ''} · ${qrData?.school_name || 'EcolePro'}`, finalCanvas.width / 2, y + 20)

    ctx.fillStyle = '#94a3b8'
    ctx.font      = '10px system-ui, sans-serif'
    ctx.fillText('EcolePro · Mon QR Code de connexion', finalCanvas.width / 2, y + 48)

    // Télécharger
    const link = document.createElement('a')
    link.download = `qrcode-${student.prenom}-${student.nom}.png`.replace(/\s+/g, '-').toLowerCase()
    link.href     = finalCanvas.toDataURL('image/png')
    link.click()
    toast.success('QR Code téléchargé !')
  }

  // ── Partager le QR Code ──────────────────────────────────
  async function partagerQR() {
    const canvas = canvasRef.current
    if (!canvas || !qrReady) return

    try {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `qrcode-${student.prenom}.png`, { type: 'image/png' })
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Mon QR Code EcolePro — ${student.prenom} ${student.nom}`,
            files: [file],
          })
        } else {
          // Fallback : copier le lien
          const url = `${window.location.origin}/login?qr=${encodeURIComponent(qrData.qr_token)}`
          await navigator.clipboard.writeText(url)
          toast.success('Lien QR copié dans le presse-papiers !')
        }
      })
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('Impossible de partager')
    }
  }

  // ══════════════════════════════════════════════════════════
  if (!student) return null

  const { studentId } = useParams()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white p-6 pb-16">
        <div className="max-w-lg mx-auto">
          <Link to={`/parent/${studentId}`}
            className="flex items-center gap-1 text-primary-200 text-sm mb-4 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retour
          </Link>
          <h1 className="text-xl font-black">Mon Profil</h1>
          <p className="text-primary-200 text-sm mt-0.5">Votre espace personnel EcolePro</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-10 pb-20 space-y-4">

        {/* ── Carte identité ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center font-black text-primary-700 text-2xl shrink-0">
              {student.prenom?.[0]}{student.nom?.[0]}
            </div>
            <div>
              <div className="text-xl font-black text-gray-900">{student.prenom} {student.nom}</div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                <BookOpen size={13} />
                {student.classes?.nom || qrData?.classe_nom || '—'}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-400 mt-0.5">
                <School size={13} />
                {student.schools?.name || qrData?.school_name || '—'}
              </div>
            </div>
          </div>

          {/* Code unique */}
          <div className="mt-4 p-3 bg-gray-50 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Code élève</div>
              <div className="font-mono font-bold text-gray-900 tracking-widest">{student.unique_code}</div>
            </div>
            <CheckCircle size={20} className="text-green-500" />
          </div>
        </div>

        {/* ── Carte QR Code ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode size={20} className="text-primary-600" />
                <h2 className="font-bold text-gray-900">Mon QR Code</h2>
              </div>
              <button onClick={genererQR} disabled={generating}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 transition-colors disabled:opacity-50">
                <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Génération…' : qrData?.qr_token ? 'Régénérer' : 'Générer'}
              </button>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !qrData?.qr_token ? (
              <div className="text-center py-8">
                <QrCode size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">Votre QR Code n'a pas encore été généré</p>
                <button onClick={genererQR} disabled={generating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto">
                  <QrCode size={16} />
                  Générer mon QR Code
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                {/* Canvas QR */}
                <div className="relative">
                  <div className="p-3 border-2 border-primary-100 rounded-2xl bg-white shadow-sm">
                    <canvas ref={canvasRef} className="block rounded-lg" />
                  </div>
                  {!qrReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl">
                      <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Info date */}
                {qrData.qr_generated_at && (
                  <p className="text-xs text-gray-400 text-center">
                    Généré le {new Date(qrData.qr_generated_at).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </p>
                )}

                {/* Activation status */}
                {qrData.activation_required && !qrData.first_login_at ? (
                  <div className="w-full flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full shrink-0" />
                    Première connexion : votre code élève sera demandé une seule fois lors du premier scan.
                  </div>
                ) : qrData.first_login_at ? (
                  <div className="w-full flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                    <CheckCircle size={14} className="shrink-0" />
                    QR Code activé depuis le {new Date(qrData.first_login_at).toLocaleDateString('fr-FR')}
                  </div>
                ) : null}

                {/* Boutons d'action */}
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button onClick={downloadQR} disabled={!qrReady}
                    className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all disabled:opacity-40 group">
                    <div className="w-10 h-10 bg-gray-100 group-hover:bg-primary-100 rounded-xl flex items-center justify-center transition-colors">
                      <Download size={20} className="text-gray-600 group-hover:text-primary-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-primary-700">Télécharger</span>
                    <span className="text-xs text-gray-400">Sauvegarder en image</span>
                  </button>

                  <button onClick={partagerQR} disabled={!qrReady}
                    className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-40 group">
                    <div className="w-10 h-10 bg-gray-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors">
                      <Share2 size={20} className="text-gray-600 group-hover:text-blue-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">Partager</span>
                    <span className="text-xs text-gray-400">Envoyer à un proche</span>
                  </button>
                </div>

                <p className="text-xs text-gray-400 text-center px-4">
                  Ce QR Code est personnel. Ne le partagez qu'avec des personnes de confiance (parent, tuteur).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Instructions ── */}
        <div className="bg-primary-50 border border-primary-200 rounded-2xl p-5">
          <h3 className="font-bold text-primary-900 mb-3 flex items-center gap-2">
            <QrCode size={16} />
            Comment utiliser mon QR Code ?
          </h3>
          <div className="space-y-2.5 text-sm text-primary-800">
            {[
              ['1', 'Ouvrez l\'application EcolePro sur l\'écran de connexion'],
              ['2', 'Appuyez sur "Connexion par QR Code"'],
              ['3', 'Scannez ce QR Code avec la caméra OU importez-le depuis votre galerie'],
              ['4', 'Lors de la première connexion, entrez votre code élève pour activer'],
            ].map(([n, txt]) => (
              <div key={n} className="flex gap-3">
                <div className="w-5 h-5 bg-primary-200 rounded-full flex items-center justify-center text-xs font-bold text-primary-700 shrink-0 mt-0.5">{n}</div>
                <p>{txt}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
