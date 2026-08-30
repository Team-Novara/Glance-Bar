import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DesktopPage } from "../features/desktop";

// React.lazy + dynamic import puts ShowcasePage (and its CSS) in a separate
// async chunk. The /showcase route is a developer / QA surface — never
// part of the default user path — so deferring it to a click / address-bar
// navigation is the right trade.
//
// The CSS side-effect import inside ShowcasePage is the trick that pulls
// showcase.css into the same async chunk, which keeps it out of the main
// bundle. The Tauri runtime builds the status center as a single-window
// app, so the main bundle must stay under our 250KB production target.
const ShowcasePage = lazy(() =>
  import("../features/showcase").then((m) => ({ default: m.ShowcasePage })),
);

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState(null, "", "/desktop");
      setPath("/desktop");
    }
  }, []);

  if (path === "/showcase") {
    return (
      <Suspense fallback={<ShowcaseLoading />}>
        <ShowcasePage />
      </Suspense>
    );
  }

  if (path === "/desktop") {
    return <DesktopPage />;
  }

  return <ShowcaseNotFound />;
}

function ShowcaseLoading() {
  // Avoid showing a blank page while the showcase chunk is loading.
  // The desktop default styles keep the wallpaper / window chrome
  // looking sensible even during the brief async chunk load.
  return (
    <main className="grid min-h-screen place-items-center bg-[#06111f] text-slate-100">
      <div className="text-sm text-slate-300">Loading showcase…</div>
    </main>
  );
}

function ShowcaseNotFound() {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen place-items-center bg-[#06111f] px-6 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-semibold" data-testid="showcase-not-found-title">{t("notFound.title")}</h1>
        <a
          className="mt-5 inline-flex rounded-full border border-sky-300/40 bg-sky-300/10 px-5 py-2 text-sm text-sky-100 transition hover:bg-sky-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          href="/desktop"
        >
          {t("notFound.openDesktop")}
        </a>
      </div>
    </main>
  );
}
