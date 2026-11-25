import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="text-center">
        <p className="eyebrow mb-3">404</p>
        <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
          {t("Not in this")} <span className="brand-text">{t("deck.")}</span>
        </h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-sm text-muted-foreground">
          {t("That page was folded, hidden or never dealt. The tables are still open.")}
        </p>
        <Link href="/" className="mt-6 inline-flex">
          <Button variant="brand" size="lg" className="gap-2">
            <ArrowLeft /> {t("Back to the table")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
