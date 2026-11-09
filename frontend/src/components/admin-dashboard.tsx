"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { apiRequest, ApiError, hasPermission, type CurrentUser } from "@/lib/api";

type UserRecord = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: "active" | "inactive" | "suspended";
  roles: string[];
  branches: string[];
  created_at: string | null;
};

type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_protected: boolean;
  is_active: boolean;
  permissions: string[];
};

type PermissionRecord = { code: string; description: string | null };
type UserListResponse = { items: UserRecord[]; total: number; page: number; page_size: number };
type Tab = "overview" | "users" | "roles";

const navigation: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard; permission?: string }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "People", icon: Users, permission: "users.view" },
  { id: "roles", label: "Roles & access", icon: Shield, permission: "roles.view" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminDashboard() {
  const { user, loading, error: sessionError, refresh, setUser } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserResult, setNewUserResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const canViewUsers = hasPermission(user, "users.view");
  const canCreateUsers = hasPermission(user, "users.create") && hasPermission(user, "roles.assign");
  const canDeactivateUsers = hasPermission(user, "users.deactivate");
  const canViewRoles = hasPermission(user, "roles.view") && hasPermission(user, "permissions.view");
  const canEditRoles = hasPermission(user, "permissions.grant");

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    setPageError(null);
    try {
      const tasks: Array<Promise<void>> = [];
      if (canViewUsers) {
        const query = new URLSearchParams({ page: "1", page_size: "100" });
        if (searchTerm) query.set("q", searchTerm);
        if (statusFilter !== "all") query.set("status", statusFilter);
        tasks.push(
          apiRequest<UserListResponse>(`/users?${query.toString()}`).then((result) => {
            setUsers(result.items);
            setUserTotal(result.total);
          }),
        );
      }
      if (canViewRoles) {
        tasks.push(
          apiRequest<RoleRecord[]>("/roles").then(setRoles),
          apiRequest<PermissionRecord[]>("/permissions").then(setPermissions),
        );
      }
      const results = await Promise.allSettled(tasks);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) throw rejected.reason;
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Unable to load the admin workspace.");
    } finally {
      setLoadingData(false);
    }
  }, [user, canViewUsers, canViewRoles, searchTerm, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRole) setRoleDraft(selectedRole.permissions);
  }, [selectedRole]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionRecord[]>();
    for (const permission of permissions) {
      const [group] = permission.code.split(".");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)?.push(permission);
    }
    return [...groups.entries()];
  }, [permissions]);

  const openTab = (next: Tab) => {
    setTab(next);
    setPageError(null);
    setNotice(null);
  };

  async function signOut() {
    try {
      await apiRequest<null>("/auth/logout", { method: "POST" });
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) {
        setPageError(reason instanceof Error ? reason.message : "Could not sign out.");
        return;
      }
    }
    setUser(null);
    window.location.assign("/");
  }

  async function toggleUserStatus(record: UserRecord) {
    const nextStatus = record.status === "active" ? "suspended" : "active";
    setPageError(null);
    try {
      await apiRequest<UserRecord>(`/users/${record.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`${record.full_name} is now ${nextStatus}.`);
      await loadData();
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Could not update this account.");
    }
  }

  async function saveRolePermissions() {
    if (!selectedRole) return;
    setSavingRole(true);
    setPageError(null);
    try {
      const updated = await apiRequest<RoleRecord>(`/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_codes: roleDraft }),
      });
      setRoles((current) => current.map((role) => role.id === updated.id ? updated : role));
      setRoleDraft(updated.permissions);
      setNotice(`${humanize(updated.name)} access updated.`);
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Could not update role permissions.");
    } finally {
      setSavingRole(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roleNames = form.getAll("role_names").map(String);
    if (!roleNames.length) {
      setPageError("Choose at least one role.");
      return;
    }
    setCreatingUser(true);
    setPageError(null);
    setNewUserResult(null);
    try {
      const body = {
        full_name: String(form.get("full_name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? "") || null,
        role_names: roleNames,
        branch_codes: String(form.get("branch_codes") ?? "")
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
        password: String(form.get("password") ?? "") || null,
      };
      const created = await apiRequest<UserRecord & { temporary_password?: string }>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNewUserResult(created.temporary_password ?? "Account created with the password you entered.");
      setNotice(`${created.full_name} was added.`);
      await loadData();
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Could not create the account.");
    } finally {
      setCreatingUser(false);
    }
  }

  if (loading) {
    return <div className="admin-loading"><LoaderCircle className="spin" /> Opening your workspace…</div>;
  }

  if (!user) {
    return (
      <main className="admin-gate">
        <Link className="brand" href="/"><span className="brand-mark">d</span><span>daybreak<span className="brand-light"> market</span></span></Link>
        <div className="gate-card">
          <div className="gate-icon"><ShieldCheck size={25} /></div>
          <span className="eyebrow">TEAM WORKSPACE</span>
          <h1>Sign in to<br /><em>your workspace.</em></h1>
          <p>{sessionError ?? "Your team tools are ready when you are."}</p>
          <Link className="button button-dark" href="/login">Sign in <ArrowRight size={16} /></Link>
        </div>
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Back to the shop</Link>
      </main>
    );
  }

  const visibleNavigation = navigation.filter((item) =>
    item.id === "roles" ? canViewRoles : !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link className="brand" href="/"><span className="brand-mark">d</span><span>daybreak<span className="brand-light"> market</span></span></Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar"><Building2 size={16} /></span>
          <span className="workspace-name"><strong>Daybreak Market</strong><small>Store workspace</small></span>
          <ChevronDown size={15} />
        </div>
        <span className="sidebar-label">WORKSPACE</span>
        <nav className="admin-nav" aria-label="Admin navigation">
          {visibleNavigation.map(({ id, label, icon: Icon }) => (
            <button type="button" className={`admin-nav-item ${tab === id ? "selected" : ""}`} onClick={() => openTab(id)} key={id}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === tab && <span className="nav-active-dot" />}
            </button>
          ))}
          <Link className="admin-nav-item" href="/"><ShoppingBasket size={17} strokeWidth={1.8} /><span>Storefront</span><ArrowUpRight className="nav-external" size={14} /></Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><span className="help-icon"><CircleHelp size={17} /></span><span><strong>Need a hand?</strong><small>We&apos;re here to help</small></span><ArrowUpRight size={14} /></div>
          <div className="sidebar-profile">
            <span className="profile-avatar">{initials(user.full_name)}</span>
            <span className="profile-name"><strong>{user.full_name}</strong><small>{user.roles.map(humanize).join(", ")}</small></span>
            <button type="button" className="icon-button profile-logout" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumbs"><span>Daybreak Market</span><ChevronRight size={14} /><strong>{navigation.find((item) => item.id === tab)?.label ?? "Overview"}</strong></div>
          <div className="topbar-actions">
            <span className="topbar-date"><Sparkles size={14} /> A good day to get things done</span>
            <button type="button" className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <span className="topbar-avatar">{initials(user.full_name)}</span>
          </div>
        </header>

        <div className="admin-content">
          {pageError && <div className="admin-alert" role="alert"><span>{pageError}</span><button type="button" onClick={() => setPageError(null)} aria-label="Dismiss"><X size={16} /></button></div>}
          {notice && <div className="admin-notice" role="status"><Check size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} /></button></div>}
          {loadingData && <div className="inline-loading"><LoaderCircle size={16} className="spin" /> Updating your workspace…</div>}

          {tab === "overview" && (
            <Overview
              user={user}
              userTotal={userTotal}
              roles={roles}
              canViewUsers={canViewUsers}
              canViewRoles={canViewRoles}
              setTab={openTab}
            />
          )}
          {tab === "users" && (
            <PeoplePage
              users={users}
              total={userTotal}
              currentUserId={user.id}
              search={search}
              setSearch={setSearch}
              setSearchTerm={setSearchTerm}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              canCreate={canCreateUsers}
              canDeactivate={canDeactivateUsers}
              onToggleStatus={toggleUserStatus}
              onCreate={() => { setShowCreateUser(true); setNewUserResult(null); }}
            />
          )}
          {tab === "roles" && (
            <RolesPage
              roles={roles}
              groups={permissionGroups}
              canEdit={canEditRoles}
              selectedRole={selectedRole}
              selectedRoleId={selectedRoleId}
              setSelectedRoleId={setSelectedRoleId}
              roleDraft={roleDraft}
              setRoleDraft={setRoleDraft}
              saving={savingRole}
              onSave={saveRolePermissions}
            />
          )}
        </div>
      </main>

      {showCreateUser && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowCreateUser(false);
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="modal-heading">
              <div><span className="eyebrow">GROWING THE TEAM</span><h2 id="create-user-title">Add a person</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowCreateUser(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {newUserResult ? (
              <div className="created-result">
                <span className="success-mark"><Check size={18} /></span>
                <h3>They&apos;re on the team.</h3>
                <p>Share this temporary password with them securely. It will only be shown here once.</p>
                <code>{newUserResult}</code>
                <button className="button button-dark full-button" type="button" onClick={() => setShowCreateUser(false)}>Done</button>
              </div>
            ) : (
              <form className="modal-form" onSubmit={createUser}>
                <label>Full name<input name="full_name" required minLength={2} maxLength={120} placeholder="Jamie Rivera" /></label>
                <label>Email address<input name="email" required type="email" placeholder="jamie@example.com" /></label>
                <label>Phone <span className="optional-label">OPTIONAL</span><input name="phone" maxLength={20} placeholder="+855 12 345 678" /></label>
                <fieldset className="role-picker">
                  <legend>Assign role</legend>
                  <div className="role-check-list">
                    {roles.filter((role) => role.is_active).map((role) => (
                      <label key={role.id} className="role-check">
                        <input type="checkbox" name="role_names" value={role.name} />
                        <span className="checkbox-custom"><Check size={12} /></span>
                        <span><strong>{humanize(role.name)}</strong><small>{role.description ?? "Team access"}</small></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>Branch codes <span className="optional-label">COMMA SEPARATED</span><input name="branch_codes" defaultValue="MAIN" placeholder="MAIN" /></label>
                <label>Temporary password <span className="optional-label">OPTIONAL</span><input name="password" minLength={10} maxLength={128} type="password" placeholder="Leave empty to generate one" /></label>
                <p className="form-footnote">Leave the password empty to generate a secure temporary password.</p>
                <button className="button button-dark full-button" type="submit" disabled={creatingUser}>
                  {creatingUser ? <><LoaderCircle size={16} className="spin" /> Adding…</> : <>Add to the team <ArrowRight size={16} /></>}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Overview({
  user,
  userTotal,
  roles,
  canViewUsers,
  canViewRoles,
  setTab,
}: {
  user: CurrentUser;
  userTotal: number;
  roles: RoleRecord[];
  canViewUsers: boolean;
  canViewRoles: boolean;
  setTab: (tab: Tab) => void;
}) {
  const activeRoleCount = roles.filter((role) => role.is_active).length;
  return (
    <section className="overview-page">
      <div className="welcome-banner">
        <div className="welcome-copy">
          <span className="eyebrow">YOUR TEAM WORKSPACE <span className="welcome-sun">✳</span> DAYBREAK MARKET</span>
          <h1>Good morning, {user.full_name.split(" ")[0]}<span className="greeting-dot">.</span></h1>
          <p>One small thing at a time. You&apos;re making good progress.</p>
        </div>
        <div className="welcome-art" aria-hidden="true"><div className="welcome-orbit" /><span>✳</span><b>hello,<br />there</b></div>
        <div className="banner-bottom"><span>DAYBREAK MARKET · TEAM WORKSPACE</span><span>01 — 01</span></div>
      </div>

      <div className="section-heading">
        <div><span className="eyebrow">YOUR SHOP AT A GLANCE</span><h2>Today, so far</h2></div>
        <span className="updated-note"><span /> LIVE FROM YOUR WORKSPACE</span>
      </div>
      <div className="stat-grid">
        <article className="stat-card stat-card-lavender"><div className="stat-top"><span>TEAM MEMBERS</span><span className="stat-icon"><Users size={17} /></span></div><strong>{canViewUsers ? userTotal : "—"}</strong><div className="stat-foot"><span>{canViewUsers ? "Accounts in your workspace" : "Your access does not include people"}</span><Users size={15} /></div></article>
        <article className="stat-card stat-card-peach"><div className="stat-top"><span>ACCESS ROLES</span><span className="stat-icon"><Shield size={17} /></span></div><strong>{canViewRoles ? activeRoleCount : "—"}</strong><div className="stat-foot"><span>{canViewRoles ? "Active role profiles" : "Role access is restricted"}</span><Shield size={15} /></div></article>
        <article className="stat-card stat-card-green"><div className="stat-top"><span>YOUR ROLE</span><span className="stat-icon"><BadgeCheck size={17} /></span></div><strong className="stat-role">{user.roles.map(humanize).join(", ") || "Member"}</strong><div className="stat-foot"><span>{user.permissions.length} permissions assigned</span><BadgeCheck size={15} /></div></article>
      </div>

      <div className="section-heading section-heading-spaced">
        <div><span className="eyebrow">A GOOD PLACE TO START</span><h2>Quick links</h2></div>
      </div>
      <div className="quick-grid">
        {canViewUsers && <button className="quick-card" onClick={() => setTab("users")}><span className="quick-icon quick-icon-lavender"><Users size={19} /></span><span><strong>People & accounts</strong><small>Manage your team and access</small></span><ArrowUpRight size={16} /></button>}
        {canViewRoles && <button className="quick-card" onClick={() => setTab("roles")}><span className="quick-icon quick-icon-peach"><SlidersHorizontal size={19} /></span><span><strong>Roles & permissions</strong><small>Shape who can do what</small></span><ArrowUpRight size={16} /></button>}
        <Link className="quick-card" href="/"><span className="quick-icon quick-icon-green"><ShoppingBasket size={19} /></span><span><strong>Visit the storefront</strong><small>See what your customers see</small></span><ArrowUpRight size={16} /></Link>
        <div className="quick-note"><Sparkles size={18} /><span><strong>Fresh start, every day.</strong><small>You&apos;re building something good.</small></span></div>
      </div>

      <div className="dashboard-bottom">
        <div className="bottom-card">
          <div className="bottom-card-head"><span className="eyebrow">UP NEXT</span><span className="soon-chip">IN THE WORKS</span></div>
          <div className="next-feature"><span className="next-icon"><Package size={18} /></span><div><h3>Catalog & inventory</h3><p>Products, stock, batches and expiry tracking.</p></div><ArrowUpRight size={16} /></div>
          <div className="feature-progress"><span /><span /><span /><span /><span /></div>
          <span className="progress-caption">THE NEXT FRESH BATCH IS BEING PREPARED</span>
        </div>
        <div className="quote-card"><span className="quote-flower">✳</span><p>“A little progress<br />every day adds up<br />to something lovely.”</p><span>— A DAYBREAK REMINDER</span></div>
      </div>
    </section>
  );
}

function PeoplePage({
  users,
  total,
  currentUserId,
  search,
  setSearch,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  canCreate,
  canDeactivate,
  onToggleStatus,
  onCreate,
}: {
  users: UserRecord[];
  total: number;
  currentUserId: string;
  search: string;
  setSearch: (value: string) => void;
  setSearchTerm: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  canCreate: boolean;
  canDeactivate: boolean;
  onToggleStatus: (user: UserRecord) => Promise<void>;
  onCreate: () => void;
}) {
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(search.trim());
  };

  return (
    <section className="people-page">
      <div className="page-title-row">
        <div><span className="eyebrow">YOUR NEIGHBORHOOD TEAM</span><h1>People & accounts</h1><p>Keep your team connected and in the right place.</p></div>
        {canCreate && <button type="button" className="button button-dark" onClick={onCreate}><Plus size={16} /> Add a person</button>}
      </div>
      <div className="people-summary">
        <div className="people-summary-icon"><Users size={20} /></div>
        <div><strong>{total} {total === 1 ? "person" : "people"}</strong><span>in your workspace</span></div>
        <span className="summary-divider" />
        <div className="team-avatars">{users.slice(0, 5).map((person, index) => <span className={`team-avatar team-avatar-${index % 4}`} key={person.id}>{initials(person.full_name)}</span>)}</div>
        <span className="summary-caption">YOUR PEOPLE, ALL IN ONE PLACE</span>
      </div>
      <div className="table-card">
        <div className="table-toolbar">
          <form className="table-search" onSubmit={handleSearch}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /><button type="submit">Search</button></form>
          <label className="filter-select"><SlidersHorizontal size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select><ChevronDown size={14} /></label>
        </div>
        <div className="people-table-wrap">
          <table className="people-table">
            <thead><tr><th>PERSON</th><th>ROLE</th><th>BRANCH</th><th>STATUS</th><th>ADDED</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {users.map((person, index) => (
                <tr key={person.id}>
                  <td><div className="person-cell"><span className={`person-avatar person-avatar-${index % 5}`}>{initials(person.full_name)}</span><span><strong>{person.full_name}</strong><small>{person.email}</small></span></div></td>
                  <td><div className="role-tags">{person.roles.map((role) => <span className="role-tag" key={role}>{humanize(role)}</span>)}</div></td>
                  <td><span className="branch-text">{person.branches.length ? person.branches.join(", ") : "—"}</span></td>
                  <td><span className={`status-pill status-${person.status}`}><i />{humanize(person.status)}</span></td>
                  <td><span className="date-text">{formatDate(person.created_at)}</span></td>
                  <td>{canDeactivate && person.id !== currentUserId && <button type="button" className="row-action" onClick={() => void onToggleStatus(person)}>{person.status === "active" ? "Suspend" : "Activate"} <ArrowUpRight size={13} /></button>}</td>
                </tr>
              ))}
              {!users.length && <tr><td className="empty-table" colSpan={6}><Users size={21} /><strong>No people found</strong><span>Try a different search or invite someone new.</span></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>Showing <strong>{users.length ? 1 : 0}–{users.length}</strong> of <strong>{total}</strong> people</span><div><button type="button" className="pagination-button" disabled><ChevronLeft size={16} /></button><span className="current-page">1</span><button type="button" className="pagination-button" disabled><ChevronRight size={16} /></button></div></div>
      </div>
      <p className="people-footnote"><ShieldCheck size={15} /> Changes to access are applied right away and recorded securely.</p>
    </section>
  );
}

function RolesPage({
  roles,
  groups,
  canEdit,
  selectedRole,
  selectedRoleId,
  setSelectedRoleId,
  roleDraft,
  setRoleDraft,
  saving,
  onSave,
}: {
  roles: RoleRecord[];
  groups: Array<[string, PermissionRecord[]]>;
  canEdit: boolean;
  selectedRole: RoleRecord | null;
  selectedRoleId: string | null;
  setSelectedRoleId: (id: string) => void;
  roleDraft: string[];
  setRoleDraft: (codes: string[]) => void;
  saving: boolean;
  onSave: () => Promise<void>;
}) {
  const changed = Boolean(selectedRole && (
    roleDraft.length !== selectedRole.permissions.length ||
    roleDraft.some((permission) => !selectedRole.permissions.includes(permission))
  ));

  function togglePermission(code: string) {
    setRoleDraft(roleDraft.includes(code)
      ? roleDraft.filter((item) => item !== code)
      : [...roleDraft, code]);
  }

  return (
    <section className="roles-page">
      <div className="page-title-row">
        <div><span className="eyebrow">CLEAR ROLES, GOOD TEAMWORK</span><h1>Roles & permissions</h1><p>Give every person the right tools for their part of the day.</p></div>
        <span className="roles-count"><ShieldCheck size={16} /> {roles.length} ROLE PROFILES</span>
      </div>
      <div className="roles-layout">
        <div className="role-list-card">
          <div className="role-list-heading"><span className="eyebrow">ROLE PROFILES</span><span>{roles.length} total</span></div>
          {roles.map((role, index) => (
            <button type="button" key={role.id} onClick={() => setSelectedRoleId(role.id)} className={`role-list-item ${selectedRoleId === role.id ? "active" : ""}`}>
              <span className={`role-list-icon role-icon-${index % 4}`}><Shield size={17} /></span>
              <span className="role-list-copy"><strong>{humanize(role.name)}</strong><small>{role.description ?? "Team role"}</small></span>
              <span className="role-permission-count">{role.permissions.length}</span>
              <ChevronRight size={15} className="role-chevron" />
            </button>
          ))}
          <div className="role-list-note"><ShieldCheck size={15} /><span>Protected roles can only be assigned by an Admin.</span></div>
        </div>

        {selectedRole ? (
          <div className="permission-card">
            <div className="permission-card-heading">
              <div className="permission-heading-icon"><ShieldCheck size={20} /></div>
              <div><span className="eyebrow">ROLE ACCESS</span><h2>{humanize(selectedRole.name)}</h2><p>{selectedRole.description ?? "Choose which areas this role can access."}</p></div>
              {selectedRole.is_protected && <span className="protected-chip"><Shield size={13} /> PROTECTED</span>}
            </div>
            {!canEdit && <div className="read-only-note"><LockIcon /> You can review this role, but only a permission manager can make changes.</div>}
            <div className="permission-groups">
              {groups.map(([group, entries]) => (
                <fieldset className="permission-group" key={group}>
                  <legend><span>{humanize(group)}</span><span>{entries.filter((entry) => roleDraft.includes(entry.code)).length}/{entries.length}</span></legend>
                  {entries.map((entry) => (
                    <label className={`permission-row ${!canEdit ? "disabled" : ""}`} key={entry.code}>
                      <input type="checkbox" checked={roleDraft.includes(entry.code)} disabled={!canEdit || selectedRole.name === "admin"} onChange={() => togglePermission(entry.code)} />
                      <span className="checkbox-custom"><Check size={12} /></span>
                      <span className="permission-copy"><strong>{humanize(entry.code.split(".")[1] ?? entry.code)}</strong><small>{entry.code}</small></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {selectedRole.name === "admin" && <p className="admin-immutable-note"><Shield size={14} /> Admin permissions are managed by the system and cannot be changed.</p>}
            {canEdit && selectedRole.name !== "admin" && (
              <div className="permission-actions"><span>{changed ? "Unsaved changes" : "All changes saved"}</span><button className="button button-dark" type="button" disabled={!changed || saving} onClick={() => void onSave()}>{saving ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <>Save changes <ArrowRight size={15} /></>}</button></div>
            )}
          </div>
        ) : (
          <div className="permission-empty"><Shield size={24} /><strong>Select a role profile</strong><span>Choose a role to review its permissions.</span></div>
        )}
      </div>
    </section>
  );
}

function LockIcon() {
  return <ShieldCheck size={15} />;
}
