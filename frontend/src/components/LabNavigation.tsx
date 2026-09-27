import { LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Dialog } from "./Dialog";

function NavigationLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <nav aria-label="Laboratory" className="flex flex-col gap-2">
      {[
        { to: "/app", label: "Decision library", icon: LayoutDashboard },
        { to: "/app/decisions/new", label: "New decision", icon: Plus },
      ].map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-text"}`
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function LabNavigation() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" /> Laboratory navigation
      </button>
      <aside
        className={`sticky top-24 hidden self-start rounded-2xl border border-border bg-surface p-3 lg:block ${collapsed ? "w-[72px]" : "w-52"}`}
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          {!collapsed && (
            <span className="pl-2 font-mono text-[10px] tracking-widest text-muted">
              DECISION LAB / 01
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <NavigationLinks collapsed={collapsed} />
        {!collapsed && (
          <p className="mt-16 border-t border-border px-2 pt-4 text-xs leading-relaxed text-muted">
            Your criteria.
            <br />
            Your evidence.
            <br />
            <span className="text-primary">A reasoned choice.</span>
          </p>
        )}
      </aside>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Laboratory navigation"
        placement="drawer"
      >
        <NavigationLinks onNavigate={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
