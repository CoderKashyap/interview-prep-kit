"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const publicPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (loading) return;
    if (!user && !publicPage) router.replace("/login");
    if (user && publicPage) router.replace("/");
  }, [loading, user, publicPage, router]);

  if (loading) {
    return (
      <div className="page-wrap flex min-h-screen items-center justify-center text-sm text-ink/60">
        Checking your session…
      </div>
    );
  }

  if (!user && !publicPage) return null;
  if (user && publicPage) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule/80 bg-white/50 backdrop-blur">
        <div className="page-wrap flex items-center justify-between py-4">
          <Link href="/" className="font-serif text-xl tracking-tight">
            Prep Kit
          </Link>
          {user ? (
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/kits/new" className="btn-primary">
                New kit
              </Link>
              <span className="hidden text-ink/60 sm:inline">{user.email}</span>
              <button className="btn-ghost" onClick={() => logout().then(() => router.push("/login"))}>
                Log out
              </button>
            </nav>
          ) : (
            <nav className="flex gap-2 text-sm">
              <Link href="/login" className="btn-ghost">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Register
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
