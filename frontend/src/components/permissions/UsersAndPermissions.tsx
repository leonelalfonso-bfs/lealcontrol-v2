import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  PermissionLevel, PermissionModule, PermissionOverrides, PermissionProfile, SensitivePermissions, TenantUser
} from "../../api/types";
import { useAuth } from "../../context/AuthContext";

const LEVELS: { value: PermissionLevel; label: string; hint: string }[] = [
  { value: "None", label: "Sin acceso", hint: "No ve el módulo" },
  { value: "View", label: "Ver", hint: "Consultar y exportar" },
  { value: "Edit", label: "Cargar", hint: "Crear y editar" },
  { value: "Approve", label: "Aprobar", hint: "Autorizar, anular, confirmar" },
  { value: "Admin", label: "Administrar", hint: "Configurar el módulo" }
];

const SENSITIVE: { key: keyof SensitivePermissions; profileKey: "seeAmounts" | "seeCosts" | "seeSalaries"; label: string }[] = [
  { key: "amounts", profileKey: "seeAmounts", label: "Importes y saldos" },
  { key: "costs", profileKey: "seeCosts", label: "Costos y márgenes" },
  { key: "salaries", profileKey: "seeSalaries", label: "Sueldos" }
];

const levelLabel = (l: PermissionLevel) => LEVELS.find((x) => x.value === l)?.label ?? l;
const levelBadge = (l: PermissionLevel) => (l === "None" ? "off" : l === "View" ? "" : l === "Edit" ? "ok" : "warn");

function effectiveOf(profile: PermissionProfile | undefined, overrides: PermissionOverrides, modules: PermissionModule[]) {
  const matrix: Record<string, PermissionLevel> = {};
  for (const m of modules) matrix[m.key] = overrides.modules?.[m.key] ?? profile?.matrix[m.key] ?? "None";
  return {
    matrix,
    sensitive: {
      amounts: overrides.amounts ?? profile?.seeAmounts ?? false,
      costs: overrides.costs ?? profile?.seeCosts ?? false,
      salaries: overrides.salaries ?? profile?.seeSalaries ?? false
    } as SensitivePermissions
  };
}

/** Resumen en palabras de lo que puede hacer (para revisar antes de dar acceso). */
function Summary({ matrix, sensitive, modules }: { matrix: Record<string, PermissionLevel>; sensitive: SensitivePermissions; modules: PermissionModule[] }) {
  const granted = modules.filter((m) => matrix[m.key] !== "None");
  const denied = modules.filter((m) => matrix[m.key] === "None");
  const sees = SENSITIVE.filter((s) => sensitive[s.key]).map((s) => s.label.toLowerCase());
  return (
    <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
      {granted.length === 0 ? <div>No tiene acceso a ningún módulo.</div> : (
        <div>{granted.map((m) => <span key={m.key} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
          <strong>{m.label}</strong>: {levelLabel(matrix[m.key]).toLowerCase()}
        </span>)}</div>
      )}
      {denied.length > 0 && <div className="muted">No ve: {denied.map((m) => m.label).join(", ")}.</div>}
      <div className="muted">{sees.length ? `Ve ${sees.join(", ")}.` : "No ve importes, costos ni sueldos."}</div>
    </div>
  );
}

type UserForm = {
  id: string | null;
  fullName: string;
  email: string;
  password: string;
  isActive: boolean;
  role: string;
  profileId: string;
  overrides: PermissionOverrides;
};

export function UsersAndPermissions() {
  const { user: currentUser, tenant } = useAuth();
  const [tab, setTab] = useState<"users" | "profiles">("users");
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [userForm, setUserForm] = useState<UserForm | null>(null);
  const [profileForm, setProfileForm] = useState<(PermissionProfile & { copyFromId?: string }) | null>(null);
  const [showExceptions, setShowExceptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [catalog, profileList, userList] = await Promise.all([
      api.getPermissionCatalog(), api.listPermissionProfiles(), api.listTenantUsers()
    ]);
    setModules(catalog.modules);
    setProfiles(profileList);
    setUsers(userList);
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  const run = async (action: () => Promise<void>, ok: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const defaultProfile = profiles.find((p) => p.systemKey === "sales") ?? profiles[0];

  // ---------- Usuarios ----------
  const newUser = () => {
    setShowExceptions(false);
    setUserForm({
      id: null, fullName: "", email: "", password: "Leal" + Math.floor(1000 + Math.random() * 9000), isActive: true,
      role: "Comercial", profileId: defaultProfile?.id ?? "", overrides: {}
    });
  };

  const editUser = (u: TenantUser) => {
    const overrides = u.overrides ?? {};
    setShowExceptions(Boolean(overrides.modules && Object.keys(overrides.modules).length) || overrides.amounts != null
      || overrides.costs != null || overrides.salaries != null);
    setUserForm({
      id: u.id, fullName: u.fullName, email: u.email, password: "", isActive: u.isActive, role: u.role,
      profileId: u.profileId ?? defaultProfile?.id ?? "", overrides
    });
  };

  const saveUser = (event: FormEvent) => {
    event.preventDefault();
    if (!userForm) return;
    const overrides = { ...userForm.overrides };
    if (overrides.modules && Object.keys(overrides.modules).length === 0) delete overrides.modules;
    const body = {
      fullName: userForm.fullName.trim(),
      role: userForm.role,
      profileId: userForm.profileId,
      overrides,
      password: userForm.password.trim() || undefined
    };
    void run(async () => {
      if (userForm.id) await api.updateTenantUser(userForm.id, { ...body, isActive: userForm.isActive });
      else await api.createTenantUser({ ...body, email: userForm.email.trim() });
      setUserForm(null);
    }, userForm.id ? "Usuario actualizado. Los cambios de módulos se ven en su próximo inicio de sesión." : "Usuario creado.");
  };

  const deleteUser = (u: TenantUser) => {
    if (currentUser?.id === u.id) return;
    if (!window.confirm(`¿Eliminar a ${u.fullName} (${u.email})? No se puede deshacer.`)) return;
    void run(async () => { await api.deleteTenantUser(u.id); }, "Usuario eliminado.");
  };

  const setModuleOverride = (key: string, value: PermissionLevel | "") => {
    if (!userForm) return;
    const next = { ...(userForm.overrides.modules ?? {}) };
    if (value === "") delete next[key]; else next[key] = value;
    setUserForm({ ...userForm, overrides: { ...userForm.overrides, modules: next } });
  };

  const setSensitiveOverride = (key: keyof SensitivePermissions, value: "" | "yes" | "no") => {
    if (!userForm) return;
    setUserForm({ ...userForm, overrides: { ...userForm.overrides, [key]: value === "" ? null : value === "yes" } });
  };

  // ---------- Perfiles ----------
  const newProfile = (from?: PermissionProfile) => {
    const base = from ?? profiles.find((p) => p.systemKey === "readonly");
    setProfileForm({
      id: "", name: from ? `${from.name} (copia)` : "", description: from?.description ?? "", systemKey: null, isLocked: false,
      matrix: { ...(base?.matrix ?? {}) }, seeAmounts: from?.seeAmounts ?? false, seeCosts: from?.seeCosts ?? false,
      seeSalaries: from?.seeSalaries ?? false, userCount: 0, copyFromId: from?.id
    });
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!profileForm) return;
    const body = {
      name: profileForm.name.trim(), description: profileForm.description?.trim() || undefined, matrix: profileForm.matrix,
      seeAmounts: profileForm.seeAmounts, seeCosts: profileForm.seeCosts, seeSalaries: profileForm.seeSalaries,
      copyFromId: profileForm.copyFromId
    };
    void run(async () => {
      if (profileForm.id) await api.updatePermissionProfile(profileForm.id, body);
      else await api.createPermissionProfile(body);
      setProfileForm(null);
    }, profileForm.id ? "Perfil actualizado: sus usuarios ya tienen los cambios (se ven en su próximo inicio de sesión)." : "Perfil creado.");
  };

  const deleteProfile = (p: PermissionProfile) => {
    if (!window.confirm(`¿Borrar el perfil "${p.name}"?`)) return;
    void run(async () => { await api.deletePermissionProfile(p.id); }, "Perfil borrado.");
  };

  const userProfile = userForm ? profileById.get(userForm.profileId) : undefined;
  const userEffective = userForm ? effectiveOf(userProfile, userForm.overrides, modules) : null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="tab-row" style={{ marginBottom: 0 }}>
        <button type="button" className={`tab-btn ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Usuarios ({users.length})</button>
        <button type="button" className={`tab-btn ${tab === "profiles" ? "active" : ""}`} onClick={() => setTab("profiles")}>Perfiles ({profiles.length})</button>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      {tab === "users" && (
        <section className="card pad">
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem", maxWidth: 640 }}>
              Cada usuario tiene un <strong>perfil</strong> (qué módulos ve y qué puede hacer) y, si hace falta, excepciones propias.
              Los usuarios son de esta empresa{tenant?.legalName ? ` (${tenant.legalName})` : ""}.
            </p>
            <button type="button" className="btn" onClick={newUser} disabled={!profiles.length}>+ Nuevo usuario</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>Perfil</th><th>Puede</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const hasOverrides = Boolean(u.overrides);
                  const visible = modules.filter((m) => (u.effectiveModules?.[m.key] ?? "None") !== "None");
                  return (
                    <tr key={u.id}>
                      <td><strong>{u.fullName}</strong><div className="muted" style={{ fontSize: "0.8rem" }}>{u.email}</div></td>
                      <td>
                        {u.profileName ?? <span className="muted">Sin perfil</span>}
                        {hasOverrides && <span className="badge warn" style={{ marginLeft: 6 }}>con excepciones</span>}
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                          {visible.length === 0 ? <span className="muted">Nada</span> : visible.map((m) => (
                            <span key={m.key} className={`badge ${levelBadge(u.effectiveModules![m.key])}`} title={levelLabel(u.effectiveModules![m.key])}>
                              {m.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td><span className={`badge ${u.isActive ? "ok" : "off"}`}>{u.isActive ? "Activo" : "Inactivo"}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-outline compact" onClick={() => editUser(u)}>Editar</button>{" "}
                        <button type="button" className="btn btn-outline compact" onClick={() => deleteUser(u)}
                          disabled={currentUser?.id === u.id} title={currentUser?.id === u.id ? "No podés eliminar tu propio usuario" : undefined}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "profiles" && (
        <section className="card pad stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem", maxWidth: 640 }}>
              Un perfil es una plantilla: nivel por módulo y datos sensibles. Al editarlo, todos sus usuarios toman el cambio.
              Los de fábrica se pueden editar o copiar; "Dueño" siempre tiene todo.
            </p>
            <button type="button" className="btn" onClick={() => newProfile()}>+ Nuevo perfil</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Perfil</th>{modules.map((m) => <th key={m.key} style={{ fontSize: "0.68rem" }}>{m.label}</th>)}<th>Sensibles</th><th>Usuarios</th><th></th></tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td style={{ minWidth: 160 }}><strong>{p.name}</strong>{p.description && <div className="muted" style={{ fontSize: "0.75rem" }}>{p.description}</div>}</td>
                    {modules.map((m) => (
                      <td key={m.key}>
                        {p.matrix[m.key] === "None" ? <span className="muted">—</span>
                          : <span className={`badge ${levelBadge(p.matrix[m.key])}`}>{levelLabel(p.matrix[m.key])}</span>}
                      </td>
                    ))}
                    <td style={{ fontSize: "0.78rem" }}>{SENSITIVE.filter((s) => p[s.profileKey]).map((s) => s.label).join(", ") || "—"}</td>
                    <td>{p.userCount}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!p.isLocked && <button type="button" className="btn btn-outline compact" onClick={() => setProfileForm({ ...p })}>Editar</button>}{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => newProfile(p)}>Copiar</button>{" "}
                      {!p.systemKey && <button type="button" className="btn btn-outline compact" onClick={() => deleteProfile(p)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {userForm && userEffective && (
        <div className="modal-backdrop">
          <form className="modal-card card pad stack" style={{ maxWidth: 720, width: "100%", gap: 12, maxHeight: "92vh", overflowY: "auto" }} onSubmit={saveUser}>
            <h3 style={{ margin: 0 }}>{userForm.id ? `Editar: ${userForm.fullName}` : "Nuevo usuario"}</h3>
            <div className="grid-2">
              <label>Nombre *
                <input required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} />
              </label>
              <label>Correo (para entrar) *
                <input required type="email" disabled={!!userForm.id} value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              </label>
              <label>{userForm.id ? "Nueva contraseña (opcional)" : "Contraseña inicial *"}
                <input required={!userForm.id} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
              </label>
              <label>Perfil *
                <select required value={userForm.profileId} onChange={(e) => setUserForm({ ...userForm, profileId: e.target.value })}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            {userProfile?.description && <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>{userProfile.description}</p>}
            {userForm.id && (
              <label className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={userForm.isActive} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })} />
                Usuario activo (puede entrar al sistema)
              </label>
            )}

            <div>
              <button type="button" className="btn btn-outline compact" onClick={() => setShowExceptions(!showExceptions)}>
                {showExceptions ? "Ocultar excepciones" : "Excepciones a su perfil…"}
              </button>
            </div>
            {showExceptions && (
              <div className="stack" style={{ gap: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Solo para este usuario. "Del perfil" toma lo que diga {userProfile?.name ?? "el perfil"}.
                </p>
                <div className="grid-2" style={{ gap: 8 }}>
                  {modules.map((m) => (
                    <label key={m.key} style={{ fontWeight: 500 }}>{m.label}
                      <select value={userForm.overrides.modules?.[m.key] ?? ""} onChange={(e) => setModuleOverride(m.key, e.target.value as PermissionLevel | "")}>
                        <option value="">Del perfil ({levelLabel(userProfile?.matrix[m.key] ?? "None")})</option>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </label>
                  ))}
                  {SENSITIVE.map((s) => {
                    const value = userForm.overrides[s.key];
                    return (
                      <label key={s.key} style={{ fontWeight: 500 }}>{s.label}
                        <select value={value == null ? "" : value ? "yes" : "no"} onChange={(e) => setSensitiveOverride(s.key, e.target.value as "" | "yes" | "no")}>
                          <option value="">Del perfil ({userProfile?.[s.profileKey] ? "ve" : "no ve"})</option>
                          <option value="yes">Ve</option>
                          <option value="no">No ve</option>
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.25)", borderRadius: 10, padding: 12 }}>
              <strong style={{ fontSize: "0.85rem" }}>Qué va a poder hacer</strong>
              <Summary matrix={userEffective.matrix} sensitive={userEffective.sensitive} modules={modules} />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setUserForm(null)}>Cancelar</button>
              <button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}

      {profileForm && (
        <div className="modal-backdrop">
          <form className="modal-card card pad stack" style={{ maxWidth: 720, width: "100%", gap: 12, maxHeight: "92vh", overflowY: "auto" }} onSubmit={saveProfile}>
            <h3 style={{ margin: 0 }}>{profileForm.id ? `Editar perfil: ${profileForm.name}` : "Nuevo perfil"}</h3>
            <div className="grid-2">
              <label>Nombre *
                <input required maxLength={80} value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
              </label>
              <label>Descripción
                <input maxLength={300} value={profileForm.description ?? ""} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} />
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Módulo</th>{LEVELS.map((l) => <th key={l.value} title={l.hint} style={{ textAlign: "center" }}>{l.label}</th>)}</tr></thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.key}>
                      <td><strong>{m.label}</strong><div className="muted" style={{ fontSize: "0.72rem" }}>{m.description}</div></td>
                      {LEVELS.map((l) => (
                        <td key={l.value} style={{ textAlign: "center" }}>
                          <input type="radio" name={`lvl-${m.key}`} checked={(profileForm.matrix[m.key] ?? "None") === l.value}
                            onChange={() => setProfileForm({ ...profileForm, matrix: { ...profileForm.matrix, [m.key]: l.value } })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
              {SENSITIVE.map((s) => (
                <label key={s.key} className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={profileForm[s.profileKey]} onChange={(e) => setProfileForm({ ...profileForm, [s.profileKey]: e.target.checked })} />
                  Ve {s.label.toLowerCase()}
                </label>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
              Cada nivel incluye a los anteriores. Por ahora el sistema controla qué módulos se ven; los niveles y los datos
              sensibles se aplican en la próxima etapa (P2 y P3).
            </p>
            {profileForm.id && profileForm.userCount > 0 && (
              <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600 }}>Lo usan {profileForm.userCount} usuario(s): toman el cambio al guardar.</p>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setProfileForm(null)}>Cancelar</button>
              <button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
