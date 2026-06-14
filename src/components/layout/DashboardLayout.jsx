import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Users, BookOpen, FileText,
  GraduationCap, Settings, LogOut, Menu, X,
  Building2, CreditCard, DollarSign, Clock,
  ClipboardCheck, CalendarDays, ShieldCheck,
  Wallet, TrendingDown, BarChart3
} from 'lucide-react'

const navItems = {
  superadmin: [
    { to: '/superadmin',              icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/superadmin/ecoles',       icon: Building2,       label: 'Écoles' },
    { to: '/superadmin/abonnements',  icon: CreditCard,      label: 'Abonnements' },
  ],
  admin: [
    { to: '/admin',                   icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/admin/eleves',            icon: Users,           label: 'Élèves' },
    { to: '/admin/classes',           icon: BookOpen,        label: 'Classes' },
    { to: '/admin/profs',             icon: GraduationCap,   label: 'Professeurs' },
    { to: '/admin/notes',             icon: ClipboardCheck,  label: 'Validation notes' },
    { to: '/admin/cours',             icon: Clock,           label: 'Validation cours' },
    { to: '/admin/bulletins',         icon: FileText,        label: 'Bulletins' },
    { to: '/admin/emploi-du-temps',   icon: CalendarDays,    label: 'Emploi du temps' },
    { to: '/admin/salaires',          icon: DollarSign,      label: 'Salaires' },
    { to: '/admin/configuration',     icon: Settings,        label: 'Configuration' },
    // L'admin peut aussi accéder aux pages secrétaire
    { to: '/secretaire/paiements',    icon: Wallet,          label: 'Paiements élèves' },
    { to: '/secretaire/depenses',     icon: TrendingDown,    label: 'Dépenses' },
    { to: '/secretaire/caisse',       icon: BarChart3,       label: 'Caisse' },
  ],
  secretaire: [
    { to: '/secretaire',              icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/secretaire/paiements',    icon: Wallet,          label: 'Paiements élèves' },
    { to: '/secretaire/depenses',     icon: TrendingDown,    label: 'Dépenses' },
    { to: '/secretaire/caisse',       icon: BarChart3,       label: 'Caisse' },
    { to: '/admin/eleves',            icon: Users,           label: 'Élèves' },  // lecture seule via RLS
  ],
  prof: [
    { to: '/prof',                    icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/prof/notes',              icon: FileText,        label: 'Saisie des notes' },
    { to: '/prof/classes',            icon: BookOpen,        label: 'Mes classes' },
    { to: '/prof/emploi-du-temps',    icon: CalendarDays,    label: 'Emploi du temps' },
    { to: '/prof/cours',              icon: Clock,           label: 'Cours effectués' },
  ],
  surveillant: [
    { to: '/surveillant',             icon: ShieldCheck,     label: 'Tableau de bord' },
  ],
}

export function Sidebar() {
  const { profile, school, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const items = navItems[profile?.role] || []

  const roleLabels = {
    superadmin:  'Super Admin',
    admin:       'Administrateur',
    secretaire:  'Secrétaire / Comptable',
    prof:        'Professeur',
    surveillant: 'Surveillant',
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-100 md:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 shadow-sm z-40
        flex flex-col transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-gray-900 text-base leading-tight">
                Ecole<span className="text-primary-600">Pro</span>
              </h1>
              {school?.name && (
                <p className="text-xs text-gray-400 truncate max-w-[130px]">{school.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin' || to === '/prof' || to === '/secretaire' || to === '/superadmin'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-primary-50 text-primary-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
              `}
            >
              <Icon size={17} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profil + déconnexion */}
        <div className="px-3 py-3 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {profile?.prenom} {profile?.nom}
            </p>
            <p className="text-xs text-gray-400">{roleLabels[profile?.role] || profile?.role}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600
                       hover:bg-red-50 transition-colors font-medium"
          >
            <LogOut size={17} className="shrink-0" />
            Se déconnecter
          </button>
        </div>
      </aside>
    </>
  )
}

export function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <main className="flex-1 md:ml-64 p-4 md:p-6 pt-16 md:pt-6 max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}