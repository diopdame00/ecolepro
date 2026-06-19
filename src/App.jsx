import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'

// Auth
import LoginPage from './pages/auth/LoginPage'

// Superadmin
import SuperAdminDashboard from './pages/superadmin/Dashboard'   // ✅ était SuperAdminDashboard
import EcolesPage          from './pages/superadmin/EcolesPage'
import AbonnementsPage     from './pages/superadmin/AbonnementsPage'

// Admin
import AdminDashboard    from './pages/admin/Dashboard'           // ✅ était AdminDashboard
import ProfsPage         from './pages/admin/ProfsPage'
import ClassesPage       from './pages/admin/ClassesPage'
import ElevesPage        from './pages/admin/ElevesPage'
import NotesValidation   from './pages/admin/NotesValidation'     // ✅ était NotesPage (inexistant)
import ConfigurationPage from './pages/admin/ConfigurationPage'
import BulletinsPage     from './pages/admin/BulletinsPage'

// Secrétaire
import SecretaireDashboard from './pages/secretaire/Dashboard'    // ✅ était SecretaireDashboard
import PaiementsPage       from './pages/secretaire/PaiementsPage'

// Professeur
import ProfDashboard      from './pages/prof/Dashboard'
import ProfNotes          from './pages/prof/NotesPage'
import ProfClasses        from './pages/prof/ClassesPage'
import ProfEmploiDuTemps  from './pages/prof/EmploiDuTempsPage'
import CoursEffectues     from './pages/prof/CoursEffectuesPage'

// Secrétaire (pages supplémentaires)
import CaissePage   from './pages/secretaire/CaissePage'
import DepensesPage from './pages/secretaire/DepensesPage'

// Admin (pages supplémentaires)
import CoursValidation    from './pages/admin/CoursValidation'
import EmploiDuTempsAdmin from './pages/admin/EmploiDuTempsPage'
import SalairesPage       from './pages/admin/SalairesPage'

// Parent / Élève
import ParentDashboard  from './pages/parent/ParentDashboard'
import ParentNotes      from './pages/parent/ParentNotes'
import ParentBulletin   from './pages/parent/ParentBulletin'
import ParentPaiements  from './pages/parent/ParentPaiements'
import ParentEmploi     from './pages/parent/ParentEmploiDuTemps'
import MonProfil        from './pages/parent/MonProfil'

function ProtectedRoute({ roles }) {
  const { user, profile, parentSession, loading, mustChangePassword } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (parentSession) {
    if (roles?.includes('parent')) return <Outlet />
    return <Navigate to={`/parent/${parentSession.student?.id}`} replace />
  }
  if (!user || !profile) return <Navigate to="/login" state={{ from: location }} replace />
  // Ne pas rediriger ici si mustChangePassword — laisser SmartRedirect gérer
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <Outlet />
}

function SmartRedirect() {
  const { user, profile, parentSession, loading, mustChangePassword } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (parentSession) return <Navigate to={`/parent/${parentSession.student?.id}`} replace />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (mustChangePassword) return <Navigate to="/login" replace />
  switch (profile.role) {
    case 'superadmin':  return <Navigate to="/superadmin" replace />
    case 'admin':       return <Navigate to="/admin" replace />
    case 'secretaire':  return <Navigate to="/secretaire" replace />
    case 'prof':        return <Navigate to="/prof" replace />
    default:            return <Navigate to="/login" replace />
  }
}

function ParentRoute() {
  const { parentSession, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!parentSession) return <Navigate to="/login" replace />
  return <Outlet />
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SmartRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      {/* ── Superadmin ── */}
      <Route element={<ProtectedRoute roles={['superadmin']} />}>
        <Route path="/superadmin"               element={<SuperAdminDashboard />} />
        <Route path="/superadmin/ecoles"        element={<EcolesPage />} />
        <Route path="/superadmin/abonnements"   element={<AbonnementsPage />} />
      </Route>

      {/* ── Admin ── */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin"                        element={<AdminDashboard />} />
        <Route path="/admin/profs"                  element={<ProfsPage />} />
        <Route path="/admin/classes"                element={<ClassesPage />} />
        <Route path="/admin/eleves"                 element={<ElevesPage />} />
        <Route path="/admin/notes"                  element={<NotesValidation />} />
        <Route path="/admin/bulletins"              element={<BulletinsPage />} />
        <Route path="/admin/configuration"          element={<ConfigurationPage />} />
        <Route path="/admin/paiements"              element={<PaiementsPage />} />
        <Route path="/admin/cours"                  element={<CoursValidation />} />
        <Route path="/admin/emploi-du-temps"        element={<EmploiDuTempsAdmin />} />
        <Route path="/admin/salaires"               element={<SalairesPage />} />
      </Route>

      {/* ── Secrétaire ── */}
      <Route element={<ProtectedRoute roles={['admin', 'secretaire']} />}>
        <Route path="/secretaire"           element={<SecretaireDashboard />} />
        <Route path="/secretaire/paiements" element={<PaiementsPage />} />
        <Route path="/secretaire/depenses"  element={<DepensesPage />} />
        <Route path="/secretaire/caisse"    element={<CaissePage />} />
      </Route>

      {/* ── Professeur ── */}
      <Route element={<ProtectedRoute roles={['prof']} />}>
        <Route path="/prof"                element={<ProfDashboard />} />
        <Route path="/prof/notes"          element={<ProfNotes />} />
        <Route path="/prof/classes"        element={<ProfClasses />} />
        <Route path="/prof/emploi-du-temps" element={<ProfEmploiDuTemps />} />
        <Route path="/prof/cours"          element={<CoursEffectues />} />
      </Route>

      {/* ── Parent / Élève ── */}
      <Route element={<ParentRoute />}>
        <Route path="/parent/:studentId"            element={<ParentDashboard />} />
        <Route path="/parent/:studentId/notes"      element={<ParentNotes />} />
        <Route path="/parent/:studentId/bulletin"   element={<ParentBulletin />} />
        <Route path="/parent/:studentId/paiements"  element={<ParentPaiements />} />
        <Route path="/parent/:studentId/profil"     element={<MonProfil />} />
        <Route path="/parent/:studentId/emploi"     element={<ParentEmploi />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}
