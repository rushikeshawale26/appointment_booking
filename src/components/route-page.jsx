import { lazy, Suspense } from "react";

const pages = {
    section: lazy(() => import("./section").then((module) => ({ default: module.Section }))),
    login: lazy(() => import("./login").then((module) => ({ default: module.Login }))),
    register: lazy(() => import("./register").then((module) => ({ default: module.Register }))),
    dashboard: lazy(() => import("./dashboard").then((module) => ({ default: module.Dashboard }))),
    adminLogin: lazy(() => import("./admin/login").then((module) => ({ default: module.AdminLogin }))),
    adminDashboard: lazy(() => import("./admin/admin-dashboard").then((module) => ({ default: module.AdminDashboard }))),
    contactView: lazy(() => import("./contact-view").then((module) => ({ default: module.ContactView }))),
    profile: lazy(() => import("./profile").then((module) => ({ default: module.Profile }))),
};

export function RoutePage({ page }) {
    const Page = pages[page];
    if (!Page) return null;

    return (
        <Suspense fallback={(
            <main role="status" className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">
                <span className="flex items-center gap-2"><i className="bi bi-arrow-repeat animate-spin"></i> Loading page...</span>
            </main>
        )}>
            <Page />
        </Suspense>
    );
}