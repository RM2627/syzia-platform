import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Brand } from "../brand/Brand";
import { platformBrand } from "../brand/platform";
import { usePermissions, sectionAction } from "../permissions/Permissions";
import { permissionIdentityLabel } from "./identity";
import {
  companyGroups,
  navigationGroup,
  navigationSection,
} from "./navigation";
import "./workspace.css";
const Context = createContext<{
  menu: HTMLElement | null;
  role: HTMLElement | null;
  group: string;
  setGroup: (s: string) => void;
  expand: () => void;
} | null>(null);
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "m3 10 9-7 9 7v11H3Z M9 21v-8h6v8",
    calendar: "M4 5h16v16H4Z M8 2v6m8-6v6M4 11h16",
    chart: "M4 3v18h17M9 17v-5m5 5V7m5 10v-9",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
    help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "m6 6 12 12M6 18 18 6",
    collapse: "m14 6-6 6 6 6",
    account: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a8 8 0 0 1 16 0v3",
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.account} />
    </svg>
  );
}
export function WorkspaceGroup({
  id,
  label,
  icon = "settings",
  children,
}: {
  id: string;
  label: string;
  icon?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Context)!;
  const opened = ctx.group === id;
  return (
    <section className="ux-nav-group">
      <button
        className="ux-group-toggle"
        aria-expanded={opened}
        aria-controls={"ux-group-" + id}
        title={label}
        onClick={() => {
          ctx.expand();
          ctx.setGroup(opened ? "" : id);
        }}
      >
        <Icon name={icon} />
        <span className="ux-nav-label">{label}</span>
        <span className="ux-chevron" aria-hidden="true">
          {opened ? "−" : "+"}
        </span>
      </button>
      <div id={"ux-group-" + id} className="ux-group-links" hidden={!opened}>
        {children}
      </div>
    </section>
  );
}
export function CompanyNavigation({ org }: { org: string }) {
  const ctx = useContext(Context);
  const { can, data } = usePermissions();
  const location = useLocation();
  const section = navigationSection(
    location.pathname.split("/").slice(3).join("/"),
  );
  useEffect(() => {
    ctx?.setGroup(navigationGroup(section));
  }, [org, section]);
  if (!ctx?.menu || !data) return null;
  const allowed = (p: string) =>
    p === "financeiro"
      ? can("analytics.financial") ||
        Object.keys(data.actions).some(
          (a) => a.startsWith("finance.") && can(a),
        )
      : p === "pagina"
        ? can("page.read") || can("portfolio.read")
        : can(sectionAction[p] || "settings.read");
  const link = (p: string, label: string) => (
    <Link
      key={p}
      to={"/painel/" + org + (p ? "/" + p : "")}
      aria-current={section === p ? "page" : undefined}
      data-tour={p || "home"}
      className={section === p ? "active" : ""}
      title={label}
    >
      {p === "" && <Icon name="home" />}
      <span className="ux-nav-label">{label}</span>
    </Link>
  );
  return (
    <>
      {createPortal(
        <nav aria-label="Navegação da empresa" className="ux-company-nav">
          {allowed("") && link("", "Início")}
          {companyGroups.map((g) => {
            const items = g.items.filter(([p]) => allowed(p));
            return (
              items.length > 0 && (
                <WorkspaceGroup key={g.id} {...g}>
                  {items.map(([p, label]) => link(p, label))}
                </WorkspaceGroup>
              )
            );
          })}
        </nav>,
        ctx.menu,
      )}
      {ctx.role &&
        createPortal(
          <span>{permissionIdentityLabel(data.role)}</span>,
          ctx.role,
        )}
    </>
  );
}
export function Workspace({
  children,
  accountName,
  role,
  company,
  globalNavigation,
  logout,
}: {
  children: ReactNode;
  accountName: string;
  role: string;
  company?: string;
  globalNavigation: ReactNode;
  logout: () => void;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(
      () => matchMedia("(max-width:849px)").matches,
    ),
    [opened, setOpened] = useState(false),
    [group, setGroup] = useState(""),
    [menu, setMenu] = useState<HTMLElement | null>(null),
    [roleHost, setRoleHost] = useState<HTMLElement | null>(null);
  const aside = useRef<HTMLElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const mq = matchMedia("(max-width:849px)");
    const change = () => {
      setMobile(mq.matches);
      setOpened(false);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    setOpened(false);
    if (location.pathname.startsWith("/admin/")) setGroup("platform");
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!opened || !mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpened(false);
      }
      if (e.key === "Tab") {
        const all = Array.from(
          aside.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = all[0],
          last = all.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !aside.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [opened, mobile]);
  return (
    <Context.Provider
      value={{
        menu,
        role: roleHost,
        group,
        setGroup,
        expand: () => setCollapsed(false),
      }}
    >
      <div className="app-shell ux-workspace" data-collapsed={collapsed && !mobile}>
        <a className="ux-skip" href="#workspace-content">
          Pular para o conteúdo
        </a>
        {opened && mobile && (
          <button
            className="ux-backdrop"
            tabIndex={-1}
            aria-label="Fechar navegação"
            onClick={() => setOpened(false)}
          />
        )}
        <aside
          id="workspace-navigation"
          ref={aside}
          className="ux-sidebar"
          data-open={opened}
          role={mobile && opened ? "dialog" : undefined}
          aria-modal={mobile && opened ? true : undefined}
          aria-label="Menu de navegação"
          inert={mobile && !opened}
        >
          <div className="ux-sidebar-top">
            <Link
              to="/app"
              className="brand"
              aria-label="SYZIA — Minhas empresas"
            >
              <Brand />
            </Link>
            <button
              ref={close}
              className="ux-close"
              aria-label="Fechar menu"
              onClick={() => setOpened(false)}
            >
              <Icon name="close" />
            </button>
            <button
              className="ux-collapse"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              onClick={() => setCollapsed((v) => !v)}
            >
              <Icon name="collapse" />
            </button>
          </div>
          <div className="ux-sidebar-scroll">
            <div ref={setMenu} />
            <nav className="ux-global-nav" aria-label="Navegação principal">
              {globalNavigation}
            </nav>
          </div>
          <div className="ux-sidebar-bottom">
            <Link to="/perfil" aria-label="Meu perfil" title="Meu perfil">
              <Icon name="account" />
              <span className="ux-nav-label">{accountName}</span>
            </Link>
            <button title="Sair" onClick={logout}>
              Sair
            </button>
          </div>
        </aside>
        <main
          id="workspace-content"
          className="workspace ux-main"
          inert={mobile && opened}
        >
          <header className="topline v-account-header ux-header">
            <button
              ref={trigger}
              className="ux-menu-trigger"
              aria-label="Abrir menu"
              aria-expanded={opened}
              aria-controls="workspace-navigation"
              onClick={() => setOpened(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="v-workspace-caption">{platformBrand.slogan}</span>
            <div className="v-account" aria-label="Usuário conectado">
              <span className="v-avatar" aria-hidden="true">
                {accountName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <span>
                <strong>{accountName}</strong>
                <small className="ux-account-role">
                  <span ref={setRoleHost} className="ux-role-host" />
                  <span className="ux-role-fallback">{role}</span>
                </small>
                <small>{company || "Selecione uma empresa"}</small>
              </span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </Context.Provider>
  );
}
