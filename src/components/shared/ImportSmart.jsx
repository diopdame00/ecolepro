import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Upload, FileText, CheckCircle, AlertCircle,
  X, Download, ChevronRight, Loader
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

// ── Normaliser la date → YYYY-MM-DD ─────────────────────────
// Accepte : 2012-03-15, 15/03/2012, 15-03-2012, 15.03.2012,
//           numéros série Excel (ex: 41275), objets Date JS
function normalizeDate(val) {
  if (val === null || val === undefined || val === '') return null

  // Objet Date JS (produit par cellDates:true dans SheetJS)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const y  = val.getFullYear()
    const m  = String(val.getMonth() + 1).padStart(2, '0')
    const d  = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Numéro série Excel brut (entier, ex: 41275 = 15/01/2013)
  if (typeof val === 'number') {
    // Epoch Excel : 1 = 1 janvier 1900 (avec le bug du 29/02/1900)
    const EXCEL_EPOCH = new Date(1899, 11, 30) // 30 déc 1899
    const ms = val * 86400000
    const date = new Date(EXCEL_EPOCH.getTime() + ms)
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    return null
  }

  const s = String(val).trim()
  if (!s) return null

  // Format ISO déjà correct : YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/)
  if (ymd) {
    const [, y, m, d] = ymd
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Essai via Date.parse en dernier recours
  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

// ── Parsing CSV simple (sans librairie) ──────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const cols = line.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cols[i] || '' })
    return obj
  }).filter(r => Object.values(r).some(v => v))
  return { headers, rows }
}

// ── Parsing Excel / ODS via SheetJS ─────────────────────────
function parseExcel(buffer) {
  // cellDates:true → SheetJS convertit les cellules date en objets Date JS
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = Object.keys(rows[0])
  return {
    headers,
    rows: rows.map(r => {
      const obj = {}
      headers.forEach(h => { obj[h] = r[h] ?? '' })
      return obj
    })
  }
}
}

// ── Colonnes attendues pour les élèves ───────────────────────
const COLONNES_ELEVE = [
  { key: 'prenom',         label: 'Prénom',           required: true  },
  { key: 'nom',            label: 'Nom',              required: true  },
  { key: 'sexe',           label: 'Sexe (M/F)',       required: true  },
  { key: 'classe',         label: 'Classe',           required: true  },
  { key: 'date_naissance', label: 'Date naissance',   required: false },
  { key: 'contact_parent', label: 'Contact parent',   required: false },
]

// ── Mapping automatique des en-têtes ────────────────────────
const AUTO_MAP = {
  prenom:         ['prenom', 'prénom', 'firstname', 'first_name', 'first name', 'givenname', 'given_name'],
  nom:            ['nom', 'lastname', 'last_name', 'last name', 'surname', 'family_name', 'familyname', 'name'],
  sexe:           ['sexe', 'genre', 'gender', 'sex'],
  classe:         ['classe', 'class', 'niveau', 'group', 'groupe'],
  date_naissance: ['date_naissance', 'datenaissance', 'naissance', 'birthday', 'dob', 'birth_date', 'date de naissance'],
  contact_parent: ['contact_parent', 'contact', 'parent', 'telephone', 'phone', 'tel'],
}

function autoDetectMapping(headers) {
  const mapping = {}
  // Normaliser les headers : minuscules + trim + suppression accents
  const normalize = str => str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les accents
  
  COLONNES_ELEVE.forEach(col => {
    const found = headers.find(h => {
      const hNorm = normalize(h)
      return AUTO_MAP[col.key]?.some(alias => hNorm === normalize(alias))
    })
    if (found) mapping[col.key] = found
  })
  return mapping
}

// ── Normaliser sexe ──────────────────────────────────────────
function normalizeSexe(val) {
  if (!val) return 'M'
  const v = val.toUpperCase().trim()
  if (v.startsWith('F') || v === 'FEMININ' || v === 'FÉMININ') return 'F'
  return 'M'
}

// ════════════════════════════════════════════════════════════
export default function ImportSmart({ schoolId, classes, onSuccess }) {
  const fileRef = useRef(null)
  const [step, setStep]         = useState('upload')   // upload | map | preview | importing | done
  const [rawData, setRawData]   = useState(null)       // { headers, rows }
  const [mapping, setMapping]   = useState({})
  const [preview, setPreview]   = useState([])
  const [errors, setErrors]     = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
  const [fileName, setFileName] = useState('')

  // ── Étape 1 : chargement fichier ─────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      let headers, rows

      const ext = file.name.split('.').pop().toLowerCase()

      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        ;({ headers, rows } = parseCSV(text))
      } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
        const buffer = await file.arrayBuffer()
        ;({ headers, rows } = parseExcel(buffer))
      } else {
        toast.error('Format non supporté. Utilisez CSV, Excel (.xlsx/.xls) ou ODS.')
        return
      }

      if (headers.length === 0 || rows.length === 0) {
        toast.error('Fichier vide ou format invalide')
        return
      }

      setRawData({ headers, rows })
      const autoMapping = autoDetectMapping(headers)
      setMapping(autoMapping)
      setStep('map')
    } catch (err) {
      toast.error('Impossible de lire le fichier : ' + err.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Étape 2 : valider le mapping et préparer la preview ──
  function validerMapping() {
    const manquants = COLONNES_ELEVE
      .filter(c => c.required && !mapping[c.key])
      .map(c => c.label)

    if (manquants.length) {
      toast.error(`Colonnes obligatoires manquantes : ${manquants.join(', ')}`)
      return
    }

    // Construire la preview avec validation
    const errs = []
    const rows = rawData.rows.map((row, i) => {
      const prenom  = row[mapping.prenom]?.trim()
      const nom     = row[mapping.nom]?.trim()
      const sexe    = normalizeSexe(row[mapping.sexe])
      const classeNom = row[mapping.classe]?.trim()
      const classe  = classes.find(c =>
        c.nom.toLowerCase() === classeNom?.toLowerCase()
      )
      const rowErrs = []
      if (!prenom || prenom.length < 2) rowErrs.push('Prénom invalide')
      if (!nom || nom.length < 2)       rowErrs.push('Nom invalide')
      if (!classe)                       rowErrs.push(`Classe "${classeNom}" introuvable`)

      if (rowErrs.length) errs.push({ ligne: i + 2, erreurs: rowErrs })

      return {
        prenom,
        nom,
        sexe,
        classe_id:       classe?.id || null,
        classe_nom:      classeNom,
        date_naissance:  mapping.date_naissance
          ? normalizeDate(row[mapping.date_naissance]) 
          : null,
        contact_parent:  mapping.contact_parent ? row[mapping.contact_parent]?.trim() || null : null,
        _valid:          rowErrs.length === 0,
        _errors:         rowErrs,
      }
    })

    setPreview(rows)
    setErrors(errs)
    setStep('preview')
  }

  // ── Étape 3 : importer ───────────────────────────────────
  async function lancerImport() {
    const valides = preview.filter(r => r._valid)
    if (valides.length === 0) {
      toast.error('Aucune ligne valide à importer')
      return
    }

    setStep('importing')
    setProgress({ done: 0, total: valides.length, failed: 0 })

    let failed = 0
    const BATCH = 20

    for (let i = 0; i < valides.length; i += BATCH) {
      const batch = valides.slice(i, i + BATCH).map(r => ({
        prenom:         r.prenom,
        nom:            r.nom,
        sexe:           r.sexe,
        classe_id:      r.classe_id,
        school_id:      schoolId,
        date_naissance: r.date_naissance || null,
        contact_parent: r.contact_parent || null,
        annee_scolaire: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
        unique_code:    `ECO-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      }))

      const { error } = await supabase.from('students').insert(batch)
      if (error) {
        failed += batch.length
        console.error('Erreur batch:', error.message)
      }

      setProgress(p => ({ ...p, done: Math.min(i + BATCH, valides.length), failed }))
    }

    setStep('done')
    if (failed === 0) {
      toast.success(`${valides.length} élève(s) importé(s) avec succès !`)
    } else {
      toast.error(`${failed} ligne(s) en erreur sur ${valides.length}`)
    }
  }

  // ── Template CSV à télécharger ───────────────────────────
  function downloadTemplate() {
    const header = 'prenom,nom,sexe,classe,date_naissance,contact_parent'
    const exemple = [
      'Fatou,Diallo,F,6ème A,2012-03-15,+221 77 000 00 00',
      'Moussa,Sow,M,6ème A,2011-09-22,+221 78 111 11 11',
      'Aissatou,Ba,F,5ème B,,',
    ].join('\n')
    const blob = new Blob([header + '\n' + exemple], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'modele_eleves.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Modèle téléchargé !')
  }

  // ════════════════════════════════════════════════════════════
  // RENDU
  // ════════════════════════════════════════════════════════════

  // ── Étape upload ─────────────────────────────────────────
  if (step === 'upload') return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
        Importez un fichier <strong>CSV, Excel (.xlsx/.xls) ou ODS</strong> avec les colonnes : prénom, nom, sexe, classe.<br />
        Les colonnes date de naissance et contact parent sont optionnelles.<br />
        <span className="text-xs text-blue-600">Formats de date acceptés : 15/03/2012, 2012-03-15, fichiers Excel avec cellules date.</span>
      </div>

      {/* Zone drop */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-all"
      >
        <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center">
          <Upload size={28} className="text-primary-600" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-900">Cliquez pour choisir un fichier</p>
          <p className="text-sm text-gray-500 mt-1">CSV, Excel (.xlsx / .xls) ou ODS — virgule ou point-virgule</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} />
      </div>

      {/* Télécharger modèle */}
      <button
        onClick={downloadTemplate}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-primary-600 font-semibold hover:bg-primary-50 rounded-xl transition-colors border border-primary-200"
      >
        <Download size={15} />
        Télécharger le modèle CSV
      </button>
    </div>
  )

  // ── Étape mapping ────────────────────────────────────────
  if (step === 'map') return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <FileText size={15} className="text-primary-600" />
        <span className="font-medium text-gray-700">{fileName}</span>
        <span>— {rawData.rows.length} ligne(s) détectée(s)</span>
      </div>

      <p className="text-sm font-semibold text-gray-700">
        Associez les colonnes de votre fichier aux champs requis :
      </p>

      <div className="space-y-3">
        {COLONNES_ELEVE.map(col => (
          <div key={col.key} className="grid grid-cols-2 gap-3 items-center">
            <label className="text-sm font-medium text-gray-700">
              {col.label}
              {col.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              value={mapping[col.key] || ''}
              onChange={e => setMapping({ ...mapping, [col.key]: e.target.value || undefined })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">— Ignorer —</option>
              {rawData.headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Aperçu 1ère ligne */}
      {rawData.rows[0] && (
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">Aperçu ligne 1 :</span>{' '}
          {rawData.headers.map(h => `${h}: ${rawData.rows[0][h]}`).join(' · ')}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep('upload')}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Retour
        </button>
        <button
          onClick={validerMapping}
          className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 flex items-center justify-center gap-2"
        >
          Prévisualiser <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )

  // ── Étape preview ────────────────────────────────────────
  if (step === 'preview') {
    const valides  = preview.filter(r => r._valid).length
    const invalides = preview.filter(r => !r._valid).length

    return (
      <div className="space-y-4">
        {/* Résumé */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-700">{valides}</p>
            <p className="text-xs text-green-600 font-medium">Lignes valides</p>
          </div>
          <div className={`border rounded-xl p-3 text-center ${invalides > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-black ${invalides > 0 ? 'text-red-600' : 'text-gray-400'}`}>{invalides}</p>
            <p className={`text-xs font-medium ${invalides > 0 ? 'text-red-500' : 'text-gray-400'}`}>Lignes en erreur</p>
          </div>
        </div>

        {/* Erreurs */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-32 overflow-y-auto">
            <p className="text-xs font-semibold text-red-700 mb-2">Lignes ignorées :</p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600">
                Ligne {e.ligne} : {e.erreurs.join(', ')}
              </p>
            ))}
          </div>
        )}

        {/* Table aperçu */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 grid grid-cols-5 gap-2 text-xs font-bold text-gray-500 uppercase">
            <span>Prénom</span><span>Nom</span><span>Classe</span><span>Sexe</span><span>Naissance</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {preview.slice(0, 50).map((r, i) => (
              <div key={i} className={`px-4 py-2 grid grid-cols-5 gap-2 text-sm ${r._valid ? '' : 'bg-red-50'}`}>
                <span className={r._valid ? 'text-gray-900' : 'text-red-500'}>{r.prenom || '—'}</span>
                <span className={r._valid ? 'text-gray-900' : 'text-red-500'}>{r.nom || '—'}</span>
                <span className="text-gray-600">{r.classe_nom || '—'}</span>
                <span className="text-gray-600">{r.sexe}</span>
                <span className="text-gray-600">{r.date_naissance || '—'}</span>
              </div>
            ))}
          </div>
        </div>
        {preview.length > 50 && (
          <p className="text-xs text-gray-400 text-center">… et {preview.length - 50} autre(s) ligne(s)</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setStep('map')}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Retour
          </button>
          <button
            onClick={lancerImport}
            disabled={valides === 0}
            className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Importer {valides} élève(s)
          </button>
        </div>
      </div>
    )
  }

  // ── Étape importing ──────────────────────────────────────
  if (step === 'importing') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="space-y-6 py-4 text-center">
        <div className="w-16 h-16 mx-auto bg-primary-100 rounded-2xl flex items-center justify-center">
          <Loader size={28} className="text-primary-600 animate-spin" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-lg">Import en cours…</p>
          <p className="text-sm text-gray-500 mt-1">{progress.done} / {progress.total} élèves</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">{pct}%</p>
      </div>
    )
  }

  // ── Étape done ───────────────────────────────────────────
  if (step === 'done') {
    const valides = preview.filter(r => r._valid).length
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <div>
          <p className="font-black text-gray-900 text-xl">Import terminé !</p>
          <p className="text-sm text-gray-500 mt-1">
            {valides - progress.failed} élève(s) importé(s)
            {progress.failed > 0 && ` · ${progress.failed} erreur(s)`}
          </p>
        </div>
        <button
          onClick={onSuccess}
          className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700"
        >
          Fermer et actualiser
        </button>
      </div>
    )
  }

  return null
}
