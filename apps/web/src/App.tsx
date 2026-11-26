import { MotionConfig } from "motion/react";
import { Suspense, lazy, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { GuestPrompt } from "@/components/auth/guest-prompt";
import { FriendInvites } from "@/components/social/friend-invites";
import { Footer, Nav } from "@/components/layout/nav";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePrefs } from "@/lib/prefs";
import { useGame } from "@/lib/game";
import { SessionProvider } from "@/lib/session";
import { playSound, primeAudio } from "@/lib/sound";
import HomePage from "@/pages/Home";
import NotFoundPage from "@/pages/NotFound";

const PlayPage = lazy(() => import("@/pages/Play"));
const RoomPage = lazy(() => import("@/pages/Room"));
const LoginPage = lazy(() => import("@/pages/Login"));
const SignupPage = lazy(() => import("@/pages/Signup"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const FriendsPage = lazy(() => import("@/pages/Friends"));
const HistoryPage = lazy(() => import("@/pages/History"));
const MatchPage = lazy(() => import("@/pages/Match"));
const AdminPage = lazy(() => import("@/pages/Admin"));
const LeaderboardPage = lazy(() => import("@/pages/Leaderboard"));
const RulesPage = lazy(() => import("@/pages/Rules"));

function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="warm-glow absolute inset-x-0 top-0 h-[560px] opacity-70" />
      <div className="absolute -left-40 top-64 size-[420px] rounded-full bg-brand/[0.045] blur-[120px]" />
    </div>
  );
}

export default function App() {
  const [location] = useLocation();
  const prefs = usePrefs();
  const { room } = useGame();
  const inRoom = location.startsWith("/room/");
  const showNav = !inRoom || room?.phase === "lobby";

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      primeAudio();
      const target = (event.target as Element | null)?.closest<HTMLElement>("button, a, [role='tab']");
      if (!target) return;
      if (target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
      // Cards, the deck and emotes have their own, richer sounds.
      if (target.closest(".pcard, .emote-button, .deck-button")) return;
      playSound(target.getAttribute("role") === "tab" ? "tab" : "click");
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <MotionConfig reducedMotion={prefs.reducedMotion ? "always" : "never"}>
      <TooltipProvider delayDuration={300}>
        <SessionProvider>
          <div className="flex min-h-dvh flex-col">
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Skip to content
            </a>
            <Ambient />
            {showNav && <Nav />}
            <main id="main" className="relative z-10 flex-1">
              <Suspense fallback={<PageLoader />}>
                <div key={location} className="min-h-full">
                  <Switch>
                    <Route path="/" component={HomePage} />
                    <Route path="/play" component={PlayPage} />
                    <Route path="/room/:code" component={RoomPage} />
                    <Route path="/login" component={LoginPage} />
                    <Route path="/signup" component={SignupPage} />
                    <Route path="/profile" component={ProfilePage} />
                    <Route path="/friends" component={FriendsPage} />
                    <Route path="/history" component={HistoryPage} />
                    <Route path="/history/:id" component={MatchPage} />
                    <Route path="/admin" component={AdminPage} />
                    <Route path="/leaderboard" component={LeaderboardPage} />
                    <Route path="/rules" component={RulesPage} />
                    <Route component={NotFoundPage} />
                  </Switch>
                </div>
              </Suspense>
            </main>
            {!inRoom && <Footer />}
          </div>
          <GuestPrompt />
          <FriendInvites />
          <Toaster position="bottom-right" richColors closeButton />
        </SessionProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
