# EcolePro — Gestion Scolaire Intelligente

## 🚀 Installation

### 1. Installer les dépendances
```bash
npm install
```

### 2. Configurer les variables d'environnement
```bash
cp .env.example .env
```
Remplir `.env` avec vos clés :
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=votre_anon_key
VITE_GEMINI_API_KEY=votre_gemini_key
```

### 3. Configurer Supabase
1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor**
3. Copier-coller le contenu de `supabase_schema.sql`
4. Exécuter le script

### 4. Créer le compte Super Admin
1. Dans Supabase > **Authentication > Users** > Add user
2. Email + mot de passe de votre choix
3. Copier l'UUID généré
4. Dans SQL Editor, exécuter :
```sql
INSERT INTO users (id, prenom, nom, email, role)
VALUES ('VOTRE_UUID', 'Votre Prénom', 'Votre Nom', 'votre@email.com', 'superadmin');
```

### 5. Lancer en développement
```bash
npm run dev
```

---

## 👥 Comptes et accès

| Rôle | URL | Accès |
|---|---|---|
| Super Admin | `/superadmin` | Email + mot de passe |
| Admin École | `/admin` | Email + mot de passe |
| Professeur | `/prof` | Email + mot de passe |
| Parent/Élève | `/` | Code unique élève (ex: ECO-2025-X7K2) |

---

## 📁 Structure du projet

```
src/
├── components/
│   ├── ui/          → Composants réutilisables (Button, Input, Modal...)
│   └── layout/      → Sidebar, DashboardLayout
├── context/         → AuthContext (gestion auth + rôles)
├── lib/             → Client Supabase
├── pages/
│   ├── auth/        → Page de connexion
│   ├── superadmin/  → Dashboard, Écoles, Abonnements
│   ├── admin/       → Dashboard, Élèves, Classes, Notes, Bulletins, Config
│   ├── prof/        → Dashboard, Saisie notes, Mes classes
│   └── parent/      → Espace consultation
├── routes/          → ProtectedRoute (protection par rôle)
└── utils/
    ├── calculs.js   → Formules de calcul des notes
    ├── bulletin.js  → Générateur PDF bulletin
    └── gemini.js    → Assistant IA import CSV
```

---

## 🛠️ Stack technique

- **React + Vite** — Frontend
- **Tailwind CSS** — Styles
- **Supabase** — Base de données + Auth + RLS
- **React Router v6** — Navigation
- **jsPDF** — Génération bulletins PDF
- **Gemini API** — Assistant IA import CSV
- **React Hot Toast** — Notifications

---

## 🔑 Obtenir une clé Gemini API (gratuit)
1. Aller sur [aistudio.google.com](https://aistudio.google.com)
2. Cliquer **Get API key**
3. Créer une clé gratuite
4. L'ajouter dans `.env`

---

## 📦 Déploiement sur Vercel
```bash
npm run build
```
Puis connecter le repo GitHub à Vercel et ajouter les variables d'environnement.
