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

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireSiteAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TokenPage />} />
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
    </QueryClientProvider>
  </StrictMode>
);
