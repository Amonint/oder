import { Link, Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-50 flex shrink-0 items-center border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        role="banner"
      >
        <Link
          to="/"
          className="flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src="/sds.png"
            alt="Oderbiz — marketing · estrategia"
            className="block h-[2.88rem] w-auto max-h-none shrink-0"
            decoding="async"
          />
        </Link>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
