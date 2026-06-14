import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui'
import { genererCodeUnique, parseCSV } from '../../utils/gemini'
import {
  Upload, Bot, ChevronRight, ChevronLeft,
  CheckCircle, Sparkles, Users, AlertCircle, X
} from 'lucide-react'
import toast from 'react-hot-toast'

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

const ETAPES = [
  'Upload',
  'Analyse IA',
  'Choix méthode',
  'Mapping',
  'Aperçu',
  'Import',
  'Succès',
]

export function ImportIntelligent({ onClose, onSuccess, classes: classesExistantes }) {
  const { schoolId, school } = useAuth()
  const [etape, setEtape]           = useState(0)
  const [fichierTexte, setFichierTexte] = useState('')
  const [rawData, setRawData]       = useState([])
  const [analyse, setAnalyse]       = useState(null)
  const [methode, setMethode]       = useState(null) // 'ia' | 'manuel'
  const [mapping, setMapping]       = useState({})
  const [preview, setPreview]       = useState([])
  const [importing, setImporting]   = useState(false)
  const [resultat, setResultat]     = useState(null)
  const [aiLoading, setAiLoading]   = useState(false)
  const fileRef = useRef()

  // ── Étape 0 : Upload ─────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      setFichierTexte(text)
      const parsed = parseCSV(text)
      setRawData(parsed)
      setEtape(1)
      analyserAvecIA(text, parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Étape 1 : Analyse IA ─────────────────────────────────
  async function analyserAvecIA(texte, parsed) {
    setAiLoading(true)
    try {
      const colonnes = parsed.length > 0 ? Object.keys(parsed[0]) : []
      const apercu   = parsed.slice(0, 5)

      const prompt = `Tu analyses un fichier CSV d'élèves scolaires.

Colonnes détectées : ${JSON.stringify(colonnes)}
Aperçu des 5 premières lignes : ${JSON.stringify(apercu)}
Classes existantes dans l'école : ${JSON.stringify(classesExistantes.map(c => c.nom))}

Retourne UNIQUEMENT ce JSON (sans backticks, sans texte avant/après) :
{
  "mapping_colonnes": {
    "prenom": "nom_colonne_ou_null",
    "nom": "nom_colonne_ou_null",
    "date_naissance": "nom_colonne_ou_null",
    "sexe": "nom_colonne_ou_null",
    "classe": "nom_colonne_ou_null",
    "contact_parent": "nom_colonne_ou_null"
  },
  "classes_detectees": ["liste des valeurs uniques de classe trouvées"],
  "classes_nouvelles": ["classes pas encore dans l'école"],
  "classes_connues": ["classes déjà dans l'école"],
  "confiance": "haute|moyenne|faible",
  "remarques": "observations courtes sur la qualité des données"
}`

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        })
      })
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)
      setAnalyse(result)
      setMapping(result.mapping_colonnes || {})
      setEtape(2)
    } catch (err) {
      toast.error('Erreur analyse IA — passage en mode manuel')
      const colonnes = rawData.length > 0 ? Object.keys(rawData[0]) : []
      setAnalyse({ mapping_colonnes: {}, classes_detectees: [], confiance: 'faible', remarques: 'Analyse manuelle requise' })
      setEtape(2)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Étape 2 : Choix méthode ──────────────────────────────
  function choisirMethode(m) {
    setMethode(m)
    if (m === 'ia') {
      genererPreview(mapping)
      setEtape(4)
    } else {
      setEtape(3)
    }
  }

  // ── Étape 3 : Mapping manuel ─────────────────────────────
  function validerMappingManuel() {
    genererPreview(mapping)
    setEtape(4)
  }

  // ── Étape 4 : Aperçu ─────────────────────────────────────
  function genererPreview(map) {
    const result = rawData.map(row => ({
      prenom:         row[map.prenom]         || '',
      nom:            row[map.nom]            || '',
      date_naissance: row[map.date_naissance] || '',
      sexe:           row[map.sexe]           || 'M',
      classe:         row[map.classe]         || '',
      contact_parent: row[map.contact_parent] || '',
    })).filter(e => e.prenom || e.nom)
    setPreview(result)
  }

  // ── Étape 5 : Import ─────────────────────────────────────
  async function confirmerImport() {
    setImporting(true)
    setEtape(5)
    try {
      // Créer les classes manquantes
      const classesMap = {}
      for (const cls of classesExistantes) {
        classesMap[cls.nom.toLowerCase()] = cls.id
      }

      for (const eleve of preview) {
        if (eleve.classe && !classesMap[eleve.classe.toLowerCase()]) {
          const { data } = await supabase
            .from('classes')
            .insert({ nom: eleve.classe, school_id: schoolId, annee_scolaire: '2024/2025' })
            .select()
            .single()
          if (data) classesMap[eleve.classe.toLowerCase()] = data.id
        }
      }

      // Insérer les élèves par batch de 50
      const annee = new Date().getFullYear().toString()
      let inseres = 0
      const BATCH = 50

      for (let i = 0; i < preview.length; i += BATCH) {
        const batch = preview.slice(i, i + BATCH).map(e => ({
          prenom:         e.prenom,
          nom:            e.nom,
          date_naissance: e.date_naissance || null,
          sexe:           ['M', 'F'].includes(e.sexe?.toUpperCase()) ? e.sexe.toUpperCase() : 'M',
          classe_id:      e.classe ? classesMap[e.classe.toLowerCase()] || null : null,
          contact_parent: e.contact_parent || null,
          school_id:      schoolId,
          unique_code:    genererCodeUnique(school?.name || 'ECO', annee),
        }))

        const { error } = await supabase.from('students').insert(batch)
        if (!error) inseres += batch.length
      }

      setResultat({ inseres, total: preview.length })
      setEtape(6)
      onSuccess?.()
    } catch (err) {
      toast.error('Erreur import : ' + err.message)
      setEtape(4)
    } finally {
      setImporting(false)
    }
  }

  const colonnes = rawData.length > 0 ? Object.keys(rawData[0]) : []
  const CHAMPS = ['prenom', 'nom', 'date_naissance', 'sexe', 'classe', 'contact_parent']
  const LABELS = {
    prenom: 'Prénom *', nom: 'Nom *', date_naissance: 'Date de naissance',
    sexe: 'Sexe (M/F)', classe: 'Classe', contact_parent: 'Contact parent'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import intelligent des élèves</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Étape {etape + 1} / {ETAPES.length} — {ETAPES[etape]}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Barre de progression */}
        <div className="px-6 pt-3">
          <div className="flex gap-1">
            {ETAPES.map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= etape ? 'bg-primary-600' : 'bg-gray-100'}`} />
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Étape 0 : Upload ── */}
          {etape === 0 && (
            <div className="flex flex-col items-center justify-center py-10">
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={handleFile} />
              <div
                onClick={() => fileRef.current.click()}
                className="w-full border-2 border-dashed border-primary-200 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-all"
              >
                <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center">
                  <Upload size={28} className="text-primary-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-900">Glissez votre fichier ici</p>
                  <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir</p>
                  <p className="text-xs text-gray-300 mt-2">CSV, TXT acceptés</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Étape 1 : Analyse IA ── */}
          {etape === 1 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center">
                <Bot size={28} className="text-primary-600 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-900">Gemini analyse votre fichier...</p>
                <p className="text-sm text-gray-400 mt-1">{rawData.length} lignes détectées</p>
              </div>
              <div className="flex gap-1 mt-2">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Étape 2 : Choix méthode ── */}
          {etape === 2 && analyse && (
            <div className="space-y-5">
              {/* Résultat analyse */}
              <div className={`rounded-xl p-4 border ${
                analyse.confiance === 'haute' ? 'bg-green-50 border-green-200' :
                analyse.confiance === 'moyenne' ? 'bg-yellow-50 border-yellow-200' :
                'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  <Bot size={20} className={analyse.confiance === 'haute' ? 'text-green-600' : analyse.confiance === 'moyenne' ? 'text-yellow-600' : 'text-red-500'} />
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">
                      Confiance IA : <span className="capitalize">{analyse.confiance}</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{analyse.remarques}</p>
                    {analyse.classes_nouvelles?.length > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⚠️ Nouvelles classes à créer : {analyse.classes_nouvelles.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => choisirMethode('ia')}
                  className="border-2 border-primary-200 hover:border-primary-500 hover:bg-primary-50 rounded-xl p-5 text-left transition-all group"
                >
                  <div className="w-10 h-10 bg-primary-100 group-hover:bg-primary-200 rounded-xl flex items-center justify-center mb-3 transition-colors">
                    <Sparkles size={20} className="text-primary-600" />
                  </div>
                  <p className="font-bold text-gray-900">Laisser l'IA ranger</p>
                  <p className="text-xs text-gray-400 mt-1">Utiliser le mapping détecté automatiquement</p>
                </button>

                <button
                  onClick={() => choisirMethode('manuel')}
                  className="border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 rounded-xl p-5 text-left transition-all group"
                >
                  <div className="w-10 h-10 bg-gray-100 group-hover:bg-gray-200 rounded-xl flex items-center justify-center mb-3 transition-colors">
                    <Users size={20} className="text-gray-600" />
                  </div>
                  <p className="font-bold text-gray-900">Ranger moi-même</p>
                  <p className="text-xs text-gray-400 mt-1">Associer manuellement les colonnes</p>
                </button>
              </div>
            </div>
          )}

          {/* ── Étape 3 : Mapping manuel ── */}
          {etape === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Associez chaque champ à la colonne correspondante de votre fichier.</p>
              {CHAMPS.map(champ => (
                <div key={champ} className="flex items-center gap-3">
                  <label className="w-40 text-sm font-medium text-gray-700 shrink-0">{LABELS[champ]}</label>
                  <select
                    value={mapping[champ] || ''}
                    onChange={e => setMapping({ ...mapping, [champ]: e.target.value || null })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">— Ignorer —</option>
                    {colonnes.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              ))}
              <div className="pt-4">
                <Button onClick={validerMappingManuel} className="w-full">
                  Voir l'aperçu
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* ── Étape 4 : Aperçu ── */}
          {etape === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{preview.length} élève(s) à importer</p>
                {analyse?.classes_nouvelles?.length > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full">
                    {analyse.classes_nouvelles.length} nouvelle(s) classe(s)
                  </span>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      {['Prénom', 'Nom', 'Classe', 'Contact parent'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-bold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((e, i) => (
                      <tr key={i} className="hover:bg-white">
                        <td className="px-3 py-2">{e.prenom || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-2">{e.nom || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-2">{e.classe || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2">{e.contact_parent || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Étape 5 : Import en cours ── */}
          {etape === 5 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-bold text-gray-900">Import en cours...</p>
                <p className="text-sm text-gray-400 mt-1">{preview.length} élèves à insérer</p>
              </div>
            </div>
          )}

          {/* ── Étape 6 : Succès ── */}
          {etape === 6 && resultat && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{resultat.inseres} élèves importés !</p>
                <p className="text-sm text-gray-400 mt-1">sur {resultat.total} lignes traitées</p>
              </div>
              <Button onClick={onClose} className="mt-2">Fermer</Button>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {[4].includes(etape) && (
          <div className="px-6 pb-5 flex gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={() => setEtape(methode === 'ia' ? 2 : 3)}>
              <ChevronLeft size={16} />
              Retour
            </Button>
            <Button className="flex-1" onClick={confirmerImport} disabled={preview.length === 0}>
              <CheckCircle size={16} />
              Confirmer l'import ({preview.length} élèves)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
