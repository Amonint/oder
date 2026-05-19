import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import RequireSiteAuth from "./components/RequireSiteAuth";
import AccountsPage from "./routes/AccountsPage";
import DashboardPage from "./routes/DashboardPage";
import PageDashboardPage from "./routes/PageDashboardPage";
import PagesPage from "./routes/PagesPage";
import TokenPage from "./routes/TokenPage";
import LoginPage from "./routes/LoginPage";
import AdValidationAdminPage from "./routes/AdValidationAdminPage";
import AdValidationParticipantPage from "./routes/AdValidationParticipantPage";
import AdValidationStudyDashboardPage from "./routes/AdValidationStudyDashboardPage";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always treat data as stale and drop inactive query data immediately.
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/ad-validation/public/:token"
              element={<AdValidationParticipantPage />}
            />
            <Route element={<RequireSiteAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<TokenPage />} />
                <Route path="/ad-validation" element={<AdValidationAdminPage />} />
                <Route
                  path="/ad-validation/studies/:studyId"
                  element={<AdValidationStudyDashboardPage />}
                />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route
                  path="/accounts/:accountId/dashboard"
                  element={<DashboardPage />}
                />
                <Route
                  path="/accounts/:accountId/pages"
                  element={<PagesPage />}
                />
                <Route
                  path="/accounts/:accountId/pages/:pageId/dashboard"
                  element={<PageDashboardPage />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
);
