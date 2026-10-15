"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, type Profile } from "@/lib/types";

interface NotificationRow {
  id: string;
  read_at: string | null;
  notifications: { id: string; title: string; body: string; created_at: string };
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("notification_recipients")
      .select("id, read_at, notifications(id, title, body, created_at)")
      .order("id", { ascending: false })
      .limit(30);
    setItems((data as unknown as NotificationRow[]) ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const unread = items.filter((i) => !i.read_at).length;

  async function markAllRead() {
    const supabase = createClient();
    const unreadRows = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unreadRows.length > 0) {
      await supabase
        .from("notification_recipients")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadRows);
    }
    load();
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="glass relative inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:scale-105 active:scale-95"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-12 z-50 w-80 max-w-[92vw] animate-scale-in rounded-2xl p-3 shadow-glass-lg">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-500 underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">No new notifications.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-xl px-3 py-2.5 text-sm ${!n.read_at ? "bg-blue-500/10" : ""}`}
                >
                  <p className="font-medium">{n.notifications.title}</p>
                  <p className="text-xs text-muted">{n.notifications.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {new Date(n.notifications.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const links: { href: string; label: string }[] = [{ href: "/dashboard", label: "Overview" }];
  if (profile.system_role === "media") {
    links.push(
      { href: "/dashboard#students", label: "Students" },
      { href: "/dashboard#workers", label: "Workers" },
      { href: "/dashboard#academic", label: "Academic" },
      { href: "/dashboard#groups", label: "GDC & PDR" },
      { href: "/dashboard#verses", label: "Memory Verses" },
      { href: "/dashboard#notifications", label: "Notifications" },
      { href: "/dashboard/results", label: "Results & Printing" }
    );
  }
  if (profile.system_role === "system_manager") {
    links.push(
      { href: "/dashboard#centers", label: "Centers" },
      { href: "/dashboard#sessions", label: "VAT Sessions" },
      { href: "/dashboard#audit", label: "Audit Log" }
    );
  }
  if (profile.system_role === "foster_parent") {
    links.push({ href: "/dashboard#roster", label: "My Foster Home" });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside
        className={`glass no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col p-4 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center gap-2 px-2 pt-1">
          <Logo size={32} />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight">VAT Portal</p>
            <p className="text-[11px] text-muted">VAT Management System</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setSidebarOpen(false)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-blue-500/10 ${
                pathname === l.href ? "bg-blue-500/15 text-blue-600 dark:text-blue-300" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="rounded-xl bg-blue-500/10 p-3 text-xs">
          <p className="font-semibold">{profile.full_name}</p>
          <p className="text-muted">{ROLE_LABELS[profile.system_role]}</p>
          <button onClick={signOut} className="mt-2 font-semibold text-red-500 underline">
            Sign out
          </button>
        </div>
      </aside>

      {/* Backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="glass no-print sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              className="glass inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="lg:hidden"><Logo size={30} /></span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
