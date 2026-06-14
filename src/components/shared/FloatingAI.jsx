import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Sparkles, ChevronDown } from 'lucide-react'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`

// Suggestions rapides selon le rôle
const SUGGESTIONS = {
  admin: [
    'Numéro du parent de [nom élève] en [classe]',
    'Liste des élèves sans classe assignée',
    'Combien de notes attendent validation ?',
    'Quels profs n\'ont pas soumis leurs notes ?',
    'Liste des parents de la [classe]',
  ],
  prof: [
    'Quels élèves n\'ont pas de notes ce trimestre ?',
    'Trie les notes du meilleur au moins bon',
    'Trie les élèves par ordre alphabétique',
    'Combien d\'élèves ont une moyenne en dessous de 10 ?',
    'Mets en évidence les élèves sans composition',
  ],
}

export function FloatingAI({ role = 'admin', context = {} }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: role === 'admin'
        ? '👋 Bonjour ! Je suis votre assistant EcolePro. Je peux vous aider à trouver des élèves, des contacts parents, suivre les notes et bien plus. Que puis-je faire pour vous ?'
        : '👋 Bonjour ! Je suis votre assistant. Je peux vous aider à gérer vos notes, rechercher des élèves, trier les données. Posez-moi n\'importe quelle question !',
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  function buildSystemPrompt() {
    const base = `Tu es un assistant intelligent intégré dans EcolePro, un logiciel de gestion scolaire au Sénégal.
Tu réponds TOUJOURS en français, de façon concise et utile.
Tu as accès aux données suivantes de l'école :`

    if (role === 'admin') {
      return `${base}
- Élèves : ${JSON.stringify(context.eleves?.slice(0, 50) || [])}
- Classes : ${JSON.stringify(context.classes || [])}
- Profs : ${JSON.stringify(context.profs || [])}
- Notes en attente : ${context.notesEnAttente || 0}

Tu peux aider à : trouver des contacts parents, lister des élèves par classe, identifier des problèmes de saisie de notes, donner des statistiques rapides.
Réponds de façon courte et précise. Si tu listes des données, utilise des puces simples.`
    }

    return `${base}
- Élèves de la classe sélectionnée : ${JSON.stringify(context.eleves || [])}
- Notes actuelles : ${JSON.stringify(context.grades || {})}
- Matière : ${context.matiere || 'non sélectionnée'}
- Classe : ${context.classe || 'non sélectionnée'}
- Trimestre : ${context.trimestre || 1}

Tu peux aider à : identifier les élèves sans notes, suggérer un tri, donner des statistiques sur les notes, trouver un élève spécifique.
Si l'utilisateur demande de TRIER ou MODIFIER l'affichage, réponds avec une action JSON structurée ainsi :
{"action": "trier", "critere": "moyenne_desc"} ou {"action": "trier", "critere": "alpha"} ou {"action": "filtrer", "critere": "sans_notes"}
Sinon réponds normalement en texte.`
  }

  async function sendMessage(text) {
    const userMsg = text || input.trim()
    if (!userMsg) return

    setInput('')
    setShowSuggestions(false)
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }))

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt() }] },
          contents: [
            ...conversationHistory,
            { role: 'user', parts: [{ text: userMsg }] }
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      })

      const data = await response.json()
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Je n\'ai pas pu traiter votre demande.'

      // Détecter si c'est une action JSON
      let action = null
      try {
        const jsonMatch = replyText.match(/\{.*\}/)
        if (jsonMatch) action = JSON.parse(jsonMatch[0])
      } catch {}

      if (action && context.onAction) {
        context.onAction(action)
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `✅ Action effectuée : ${action.critere === 'moyenne_desc' ? 'Notes triées du meilleur au moins bon' : action.critere === 'alpha' ? 'Élèves triés alphabétiquement' : action.critere === 'sans_notes' ? 'Affichage des élèves sans notes' : 'Traitement effectué'}`
        }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: replyText }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: '❌ Erreur de connexion. Vérifiez votre clé Gemini.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl transition-all duration-300 ${
          open
            ? 'bg-gray-700 text-white'
            : 'bg-primary-600 hover:bg-primary-700 text-white'
        }`}
      >
        {open ? <X size={20} /> : <Bot size={20} />}
        <span className="font-bold text-sm hidden sm:block">
          {open ? 'Fermer' : 'Assistant IA'}
        </span>
        {!open && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Panneau chat */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ height: '480px' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-blue-500 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Assistant EcolePro</p>
              <p className="text-blue-100 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                En ligne · Gemini AI
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions rapides */}
          {showSuggestions && (
            <div className="px-3 pb-2">
              <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                <Sparkles size={11} />
                Suggestions rapides
              </p>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {SUGGESTIONS[role]?.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg transition-colors truncate"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-1 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && sendMessage()}
                placeholder="Posez votre question..."
                className="flex-1 px-3 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="w-9 h-9 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
