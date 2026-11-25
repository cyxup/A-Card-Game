import { Coins, LogOut, Menu, Play, Shield, Trophy, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { Logo } from "@/components/brand/logo";
import { NameEffect } from "@/components/brand/name-effect";
import { askForName } from "@/components/auth/guest-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { compactNumber } from "@/lib/format";
import { useGame } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/rules", label: "How to play" },
  { href: "/leaderboard", label: "Leaderboard" },
];

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const [location] = useLocation();
  const t = useT();
  const active = location === href || location.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-150",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {t(label)}
    </Link>
  );
}

export function Nav() {
  const { session, loading, logout } = useSession();
  const { room } = useGame();
  const t = useT();
  const prefs = usePrefs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  const [inRoom] = useRoute("/room/:code");
  const user = session?.user ?? null;
  const guest = session?.kind === "guest" ? session.guestName : null;

  function toggleLocale() {
    setPrefs({ locale: prefs.locale === "fr" ? "en" : "fr" });
  }

  async function signOut() {
    try {
      await logout();
      toast.info(t("You signed out."));
      navigate("/");
    } catch {
      toast.error(t("Could not sign out."));
    }
  }

  return (
    <header className="site-nav sticky top-0 z-40 border-b border-white/8 bg-background/92 supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-5 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
          {room && !inRoom && (
            <Link
              href={`/room/${room.code}`}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-brand/25 bg-brand/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-brand transition-colors hover:bg-brand/[0.1]"
            >
              <Play className="size-3" /> {t("Back to {code}", { code: room.code })}
            </Link>
          )}
          {user?.owner && <NavLink href="/admin" label="Admin" />}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {loading ? (
            <div className="h-8 w-28 animate-pulse rounded-md bg-accent" />
          ) : user ? (
            <>
              <Link
                href="/profile"
                className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
              >
                <Coins className="size-3.5 text-brand" />
                <span className="font-mono tabular-nums">{compactNumber(user.coins)}</span>
              </Link>
              <Link href="/profile" className="group flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-accent">
                <Avatar id={user.avatar} size={28} />
                <span className="hidden max-w-[140px] text-[13px] font-medium sm:block">
                  <NameEffect effect={user.nameEffect}>{user.displayName}</NameEffect>
                </span>
                <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">L{user.level}</span>
              </Link>
              <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label={t("Sign out")} className="hidden sm:inline-flex">
                <LogOut />
              </Button>
            </>
          ) : guest ? (
            <>
              <Badge variant="outline" className="hidden sm:inline-flex">
                {t("guest · {name}", { name: guest })}
              </Badge>
              <Link href="/signup">
                <Button variant="brand" size="sm">
                  {t("Save your progress")}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t("Sign in")}
                </Button>
              </Link>
              <Button
                variant="brand"
                size="sm"
                onClick={() => askForName(() => navigate("/play"))}
                className="hidden sm:inline-flex"
              >
                {t("Play as guest")}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleLocale}
            aria-label={t("Language")}
            title={t("Language")}
            data-no-sound
            className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground"
          >
            {prefs.locale === "fr" ? "EN" : "FR"}
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-sm" className="md:hidden" aria-label={t("Menu")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <SheetHeader>
                <SheetTitle>{t("Menu")}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4">
                {LINKS.map((link) => (
                  <NavLink key={link.href} {...link} onClick={() => setMenuOpen(false)} />
                ))}
                <Button
                  variant="ghost"
                  className="justify-start gap-2"
                  onClick={toggleLocale}
                >
                  {prefs.locale === "fr" ? "English" : "Français"}
                </Button>
                <div className="my-3 h-px bg-border" />
                {user ? (
                  <>
                    <Link href="/profile" onClick={() => setMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-2">
                        <UserRound /> {t("Profile & cosmetics")}
                      </Button>
                    </Link>
                    {user.owner && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start gap-2">
                          <Shield /> {t("Admin")}
                        </Button>
                      </Link>
                    )}
                    <Button variant="ghost" className="justify-start gap-2" onClick={signOut}>
                      <LogOut /> {t("Sign out")}
                    </Button>
                  </>
                ) : guest ? (
                  <>
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      {t("Playing as {name}", { name: guest })}
                    </p>
                    <Link href="/signup" onClick={() => setMenuOpen(false)}>
                      <Button variant="brand" className="w-full">
                        {t("Create an account")}
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/login" onClick={() => setMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        {t("Sign in")}
                      </Button>
                    </Link>
                    <Button
                      variant="brand"
                      className="w-full"
                      onClick={() => {
                        setMenuOpen(false);
                        askForName(() => navigate("/play"));
                      }}
                    >
                      {t("Play as guest")}
                    </Button>
                  </>
                )}
                {room && (
                  <Link href={`/room/${room.code}`} onClick={() => setMenuOpen(false)}>
                    <Button variant="secondary" className="mt-2 w-full gap-2">
                      <Play /> {t("Back to {code}", { code: room.code })}
                    </Button>
                  </Link>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-auto border-t border-white/8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Logo compact />
          <span>{t("stacked — play your hand, stack the deck.")}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/rules" className="hover:text-foreground">
            {t("Rules")}
          </Link>
          <Link href="/leaderboard" className="hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              <Trophy className="size-3" /> {t("Leaderboard")}
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">v0.1</span>
        </div>
      </div>
    </footer>
  );
}
