# EcolePro — Refonte professionnelle
## Synthèse de l'audit, des corrections et des nouveaux modules

---

## 1. Ordre d'exécution des migrations SQL

Dans l'éditeur SQL de Supabase, exécuter **dans cet ordre exact** :

1. `migration_01_corrections.sql` — corrections, normalisation, RLS de base, sessions parent
2. `migration_02_nouveaux_modules.sql` — finance, emploi du temps, cours effectués, salaires
3. `migration_03_ia_fonctions.sql` — fonctions RPC pour l'assistant IA
4. `migration_04_surveillant.sql` — présences, retards, discipline

Chaque script est idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) et peut être rejoué sans danger.

---

## 2. Corrections appliquées (audit)

| # | Problème détecté | Correction |
|---|---|---|
| 1 | `ParentSpace` accessible sans authentification (UUID brute-forçable) | Système de token signé (`parent_sessions`) + RPC `login_parent_by_code` / `verify_parent_session` |
| 2 | `signInWithCode` ne créait pas de session → RLS inopérant pour le parent | Accès parent désormais **exclusivement** via fonctions RPC `SECURITY DEFINER` (`get_student_grades_by_token`, etc.) |
| 3 | Le Super Admin avait accès via RLS aux `students`, `grades`, `results` | Toutes les policies excluent désormais explicitement `role = 'superadmin'` |
| 4 | `supabase.auth.admin.createUser` appelé côté client (nécessite `service_role`) | Déplacé dans l'Edge Function `create-school` (clé `service_role` côté serveur uniquement) |
| 5 | Clé API Gemini exposée via `VITE_GEMINI_API_KEY` | Déplacée dans l'Edge Function `ai-assistant`, jamais exposée au navigateur |
| 6 | Rôles `secretaire` et `surveillant` absents du schéma | Ajoutés à la contrainte `users.role`, nouvelles pages et RLS dédiées |
| 7 | `classes.nb_eleves` référencé mais inexistant | Remplacé par la vue `classes_with_count` |
| 8 | Incohérence `status` (grades) vs `statut` (subscriptions) | Tout renommé en **`statut`** (colonne + tout le code frontend) |
| 9 | `school_config` sans trigger `updated_at` | Trigger ajouté |
| 10 | Index manquants (`prof_classes`, `users(school_id, role)`, etc.) | 15+ index ajoutés |
| 11 | `students.date_naissance` en `TEXT` | Converti en `DATE` avec migration sécurisée des données existantes |
| 12 | Pas de contrainte sur les notes | `CHECK (0 ≤ note ≤ 20)` ajouté sur `grades` |
| 13 | `moyenne_devoirs` / `moyenne_matiere` calculées en double (client + stockage) | Calcul unique via trigger `calculate_grade_averages`, code client simplifié |
| 14 | Champs Super Admin manquants (`director_name`, `subscription_plan`, etc.) | Ajoutés à `schools` ; `EcolesPage`/`Dashboard` superadmin ne lisent plus la table `users` |
| 15 | `prof_id` absent lors de l'enregistrement des notes | Ajouté — requis par la nouvelle policy RLS `prof_access_own_grades` |

---

## 3. Nouveaux modules livrés

### 3.1 Gestion financière
- `fee_types`, `student_payments`, `receipts` — paiements partiels/complets, génération automatique de numéro de reçu
- `expenses` — dépenses par catégorie (salaires, fournitures, électricité, eau, internet, etc.)
- Vues `caisse_summary` / `caisse_mensuelle` / `school_payment_dashboard` — calcul automatique recettes/dépenses/solde
- Pages : `secretaire/PaiementsPage`, `secretaire/DepensesPage`, `secretaire/CaissePage`, `secretaire/Dashboard`

### 3.2 Emploi du temps
- `timetable_slots` avec contraintes anti-conflit (prof/salle/créneau)
- Pages : `admin/EmploiDuTempsPage` (CRUD), `prof/EmploiDuTempsPage` (lecture), RPC `get_student_timetable_by_token` (parent)

### 3.3 Cours effectués
- `course_sessions` avec calcul automatique de la durée (`GENERATED ALWAYS AS`)
- Statuts : `effectue` → `valide` / `rejete` (avec motif)
- Pages : `prof/CoursEffectuesPage` (déclaration), `admin/CoursValidation` (validation)
- Vue `prof_hours_summary`

### 3.4 Salaires
- `salary_configs` (fixe ou horaire), `salary_payments`
- RPC `calculate_prof_salary` — calcul automatique à partir des heures validées
- Page : `admin/SalairesPage`

### 3.5 Module Surveillant
- `attendance_records` (présent/absent/absent justifié/retard) + `discipline_records`
- Synchronisation automatique vers `results.absences` / `results.retards` via trigger
- Page : `surveillant/Dashboard`

### 3.6 Assistant IA étendu
- Edge Function `ai-assistant` : contexte système généré dynamiquement selon le rôle, clé API jamais exposée
- Fonctions RPC sécurisées par rôle (`ai_eleves_impaye`, `ai_stats_ecole`, `ai_eleves_faibles`, `ai_absences_jour`, etc.) — chacune vérifie `get_user_role()` / `get_user_school_id()` avant de répondre

---

## 4. Rôles finaux

| Rôle | Accès |
|---|---|
| **superadmin** | Uniquement `schools` (nom, directeur, contact, formule, expiration). Aucun accès aux données pédagogiques/financières des écoles. |
| **admin** | Gestion complète de son école (élèves, classes, notes, emploi du temps, validation cours, salaires, config) + accès lecture/écriture aux modules secrétaire |
| **secretaire** | Paiements élèves, dépenses, caisse, reçus, suivi financier |
| **prof** | Notes (ses classes/matières uniquement), emploi du temps, cours effectués |
| **surveillant** | Présences, retards, discipline |
| **parent/élève** | Compte unique par code élève (token signé), accès en lecture à notes/absences/paiements/emploi du temps/bulletins de **son** enfant uniquement |

---

## 5. Déploiement des Edge Functions

```bash
# Authentification
supabase login
supabase link --project-ref <votre-projet>

# Secrets (jamais préfixés VITE_)
supabase secrets set GEMINI_API_KEY=xxxxxxxx

# Déploiement
supabase functions deploy ai-assistant
supabase functions deploy create-school
```

`create-school` nécessite `SUPABASE_SERVICE_ROLE_KEY`, automatiquement disponible dans l'environnement des Edge Functions Supabase (ne pas la définir manuellement, ne jamais la commiter).

---

## 6. Points d'attention restants (non bloquants)

- Le calcul du trimestre dans `sync_results_attendance` (Oct-Déc / Jan-Mars / Avr-Juin) est une approximation : à ajuster si le calendrier scolaire de l'école diffère.
- `subscription_payments.montant` reste en `INTEGER` (F CFA, pas de centimes) — documenté.
- Les fichiers `prof/Dashboard.jsx` et `admin/Dashboard.jsx` ont été mis à jour uniquement pour le renommage `status` → `statut` ; ils peuvent être enrichis ultérieurement avec les nouvelles stats financières si souhaité.
- Le composant `genererBulletin` (PDF) n'a pas été modifié — il consomme déjà la structure `notes`/`resultats` compatible.
