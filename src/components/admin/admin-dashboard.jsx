import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api";
import { useCookies } from "react-cookie";

const PAGE_SIZE = 8;

function formatDate(value) {
    const d = new Date(value);
    return isNaN(d) ? value : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const CATEGORY_COLORS = [
    "bg-sky-100 text-sky-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
    "bg-fuchsia-100 text-fuchsia-700",
];

function getCategory(a) {
    return a.category || "Uncategorized";
}

// "Accepted" | "Waited" | "Pending"
function getStatus(a) {
    const status = String(a.status || "").toLowerCase();
    if (status === "accepted") return "Accepted";
    if (status === "waited" || status === "waiting") return "Waited";
    return "Pending";
}

function categoryColor(name) {
    if (name === "Uncategorized") return "bg-slate-100 text-slate-500";
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

// What each admin action calls on the backend, and how it is worded in the UI
const ACTIONS = {
    accept: {
        request: (id) => axios.put(`/accept-appointment/${id}`),
        title: "Accept appointment?",
        button: "Accept",
        buttonClass: "bg-emerald-600 hover:bg-emerald-700",
        success: "Appointment accepted",
        error: "Failed to accept appointment",
    },
    wait: {
        request: (id) => axios.put(`/wait-appointment/${id}`),
        title: "Put appointment on wait?",
        button: "Move to Waiting",
        buttonClass: "bg-amber-500 hover:bg-amber-600",
        success: "Appointment moved to waiting list",
        error: "Failed to move appointment to waiting",
    },
    delete: {
        request: (id) => axios.delete(`/delete-appointment/${id}`),
        title: "Delete appointment?",
        button: "Delete",
        buttonClass: "bg-red-600 hover:bg-red-700",
        success: "Appointment deleted",
        error: "Failed to delete appointment",
    },
};

const VIEWS = [
    { key: "Pending", label: "Pending Appointments", badge: "bg-amber-100 text-amber-700", empty: "No pending appointments 🎉" },
    { key: "Waited", label: "Waited Appointments", badge: "bg-sky-100 text-sky-700", empty: "No appointments on wait" },
    { key: "Accepted", label: "Accepted Appointments", badge: "bg-emerald-100 text-emerald-700", empty: "No accepted appointments yet" },
];

const StatCard = memo(function StatCard({ label, value, color, dot }) {
    return (
        <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`ml-auto text-xl font-bold leading-none ${color}`}>{value}</p>
        </div>
    );
});

const SortHeader = memo(function SortHeader({ label, field, sort, onSort }) {
    return (
        <th
            onClick={() => onSort(field)}
            className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-900"
        >
            {label} {sort.key === field ? (sort.dir === "asc" ? "▲" : "▼") : ""}
        </th>
    );
});

export function AdminDashboard() {
    const [cookie, , removeCookie] = useCookies(["role", "username"]);
    const isAdmin = cookie.role === "admin";
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [view, setView] = useState("Pending"); // "Pending" | "Waiting" | "Accepted"
    const [sort, setSort] = useState({ key: "date", dir: "desc" });
    const [page, setPage] = useState(1);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [confirm, setConfirm] = useState(null); // { type: "accept" | "wait" | "delete", item }
    const [activePanel, setActivePanel] = useState("appointments");
    const permissionMode = activePanel === "permission";
    const [selectedIds, setSelectedIds] = useState([]);
    const [contactEmail, setContactEmail] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [shareLoading, setShareLoading] = useState(false);
    const [shareError, setShareError] = useState("");
    const [shareMessage, setShareMessage] = useState("");
    const [shareItems, setShareItems] = useState([]);
    const [revokingId, setRevokingId] = useState(null);
    const navigate = useNavigate();

    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadAppointments = useCallback(() => {
        axios
            .get("/appointment")
            .then((res) => setAppointments(res.data))
            .catch((err) => {
                console.log(err);
                setError("Could not load appointments. Is the server running?");
            })
            .finally(() => setLoading(false));
    }, []);

    const loadShares = useCallback(() => {
        axios.get("/appointment-shares")
            .then(({ data }) => setShareItems(data))
            .catch((err) => setShareError(err.response?.data?.error || "Could not load shared links."));
    }, []);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    useEffect(() => {
        if (permissionMode && isAdmin) loadShares();
    }, [permissionMode, isAdmin, loadShares]);

    function runAction() {
        if (!confirm) return;
        const { type, item } = confirm;
        const action = ACTIONS[type];
        setBusyId(item._id);
        action
            .request(item._id)
            .then(() => {
                showToast(action.success);
                loadAppointments();
            })
            .catch((err) => {
                console.log(err);
                showToast(action.error, "error");
            })
            .finally(() => {
                setBusyId(null);
                setConfirm(null);
            });
    }

    function handleSignOut() {
        axios.post("/logout").finally(() => {
            removeCookie("username", { path: "/" });
            removeCookie("role", { path: "/" });
            navigate("/login");
        });
    }

    function toggleSelected(id) {
        setSelectedIds((current) => current.includes(id)
            ? current.filter((selectedId) => selectedId !== id)
            : [...current, id]);
    }

    function sendShare(e) {
        e.preventDefault();
        setShareError("");
        setShareMessage("");
        setShareLoading(true);
        axios.post("/appointment-shares", {
            email: contactEmail,
            appointmentIds: selectedIds,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        })
            .then(({ data }) => {
                setSelectedIds([]);
                setShareMessage(data.message || "Access link sent.");
                loadShares();
            })
            .catch((err) => setShareError(err.response?.data?.error || "Could not send access link."))
            .finally(() => setShareLoading(false));
    }

    function revokeShare(id) {
        setRevokingId(id);
        axios.patch(`/appointment-shares/${id}/revoke`)
            .then(() => {
                setShareItems((items) => items.map((item) => item._id === id ? { ...item, revokedAt: new Date().toISOString() } : item));
            })
            .catch((err) => setShareError(err.response?.data?.error || "Could not revoke access."))
            .finally(() => setRevokingId(null));
    }

    const toggleSort = useCallback((key) => {
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    }, []);

    const stats = useMemo(() => {
        const s = { Pending: 0, Waited: 0, Accepted: 0 };
        appointments.forEach((a) => (s[getStatus(a)] += 1));
        return { total: appointments.length, ...s };
    }, [appointments]);

    const currentView = VIEWS.find((v) => v.key === view);
    const activeList = useMemo(() => appointments.filter((a) => getStatus(a) === view), [appointments, view]);
    const colCount = permissionMode ? 7 : 6;

    const categories = useMemo(() => [...new Set(activeList.map(getCategory))].sort(), [activeList]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = activeList.filter((a) => {
            if (categoryFilter !== "All" && getCategory(a) !== categoryFilter) return false;
            if (!q) return true;
            return [a.username, a.title, a.description, getCategory(a)].some((f) => String(f ?? "").toLowerCase().includes(q));
        });
        list.sort((a, b) => {
            const val = (x) => (sort.key === "category" ? getCategory(x) : x[sort.key]);
            const av = sort.key === "date" ? new Date(a.date).getTime() || 0 : String(val(a) ?? "").toLowerCase();
            const bv = sort.key === "date" ? new Date(b.date).getTime() || 0 : String(val(b) ?? "").toLowerCase();
            if (av < bv) return sort.dir === "asc" ? -1 : 1;
            if (av > bv) return sort.dir === "asc" ? 1 : -1;
            return 0;
        });
        return list;
    }, [activeList, search, categoryFilter, sort]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    function exportCsv() {
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const rows = [["User", "Title", "Category", "Description", "Date", "Status"], ...filtered.map((a) => [a.username, a.title, getCategory(a), a.description, a.date, getStatus(a)])];
        const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${view.toLowerCase()}-appointments.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="flex min-h-screen bg-slate-100">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white shadow-lg transition-transform md:static md:translate-x-0 ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="px-5 pb-2 pt-5 text-xl font-bold text-indigo-600">Workspace</div>

                <div className="mx-3 mt-3 rounded-xl bg-gradient-to-br from-indigo-50 to-white p-4 ring-1 ring-indigo-100">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white">A</div>
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">Admin</p>
                            <p className="text-xs text-slate-500">Administrator</p>
                        </div>
                    </div>
                </div>

                <nav className="mt-4 p-3">
                    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Menu</p>
                    {VIEWS.map((item) => (
                        <button
                            key={item.key}
                            onClick={() => {
                                setActivePanel("appointments");
                                setView(item.key);
                                setCategoryFilter("All");
                                setPage(1);
                                setSidebarOpen(false);
                            }}
                            className={`mb-1 flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${
                                view === item.key ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            <span>{item.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.badge}`}>{stats[item.key]}</span>
                        </button>
                    ))}
                    {isAdmin ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Settings</p>
                        <button
                            onClick={() => {
                                setActivePanel("permission");
                                setSidebarOpen(false);
                            }}
                            className={`mb-1 flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm font-medium transition ${permissionMode ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"}`}
                        >
                            Permission
                        </button>
                        <button
                            onClick={() => navigate("/profile")}
                            className="mb-1 flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                            Edit Profile
                        </button>
                        <button
                            onClick={handleSignOut}
                            className="flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                            Sign out
                        </button>
                    </div>
                    ) : (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                            <button onClick={() => navigate("/profile")} className="mb-1 flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50">Edit Profile</button>
                            <button onClick={handleSignOut} className="flex w-full items-center rounded-lg px-4 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50">Sign out</button>
                        </div>
                    )}
                </nav>
            </aside>
            {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />}

            {/* Main */}
            <main className="min-w-0 flex-1 p-4 md:p-8">
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button className="rounded-lg bg-white p-2 shadow-sm md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                            ☰
                        </button>
                        <h1 className="text-2xl font-bold text-slate-800">{permissionMode ? "Permission" : currentView.label}</h1>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={loadAppointments} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                            Refresh
                        </button>
                        <button onClick={exportCsv} disabled={!filtered.length} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="mb-5 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Total" value={stats.total} color="text-slate-800" dot="bg-slate-400" />
                    <StatCard label="Pending" value={stats.Pending} color="text-amber-500" dot="bg-amber-400" />
                    <StatCard label="Waited" value={stats.Waited} color="text-sky-600" dot="bg-sky-500" />
                    <StatCard label="Accepted" value={stats.Accepted} color="text-emerald-600" dot="bg-emerald-500" />
                </div>

                {permissionMode && (
                    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Appointment status">
                        {VIEWS.map((item) => (
                            <button
                                key={item.key}
                                role="tab"
                                aria-selected={view === item.key}
                                onClick={() => {
                                    setView(item.key);
                                    setPage(1);
                                }}
                                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${view === item.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                            >
                                {item.key} <span className="ml-1 opacity-75">{stats[item.key]}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Toolbar */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search by user, title or description..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:max-w-sm"
                    />
                    <select
                        value={categoryFilter}
                        onChange={(e) => {
                            setCategoryFilter(e.target.value);
                            setPage(1);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                        <option value="All">All categories</option>
                        {categories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                {permissionMode && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Select</th>}
                                <SortHeader label="User" field="username" sort={sort} onSort={toggleSort} />
                                <SortHeader label="Title" field="title" sort={sort} onSort={toggleSort} />
                                <SortHeader label="Category" field="category" sort={sort} onSort={toggleSort} />
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Description</th>
                                <SortHeader label="Date" field="date" sort={sort} onSort={toggleSort} />
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                [...Array(4)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={colCount} className="px-4 py-4">
                                            <div className="h-4 animate-pulse rounded bg-slate-200" />
                                        </td>
                                    </tr>
                                ))
                            ) : error ? (
                                <tr>
                                    <td colSpan={colCount} className="px-4 py-10 text-center text-red-500">{error}</td>
                                </tr>
                            ) : pageItems.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount} className="px-4 py-10 text-center text-slate-500">{currentView.empty}</td>
                                </tr>
                            ) : (
                                pageItems.map((a) => {
                                    const busy = busyId === a._id;
                                    return (
                                        <tr key={a._id} className="hover:bg-slate-50">
                                            {permissionMode && (
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Select ${a.title}`}
                                                        checked={selectedIds.includes(a._id)}
                                                        onChange={() => toggleSelected(a._id)}
                                                    />
                                                </td>
                                            )}
                                            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{a.username}</td>
                                            <td className="px-4 py-3 text-slate-700">{a.title}</td>
                                            <td className="whitespace-nowrap px-4 py-3">
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryColor(getCategory(a))}`}>
                                                    {getCategory(a)}
                                                </span>
                                            </td>
                                            <td className="max-w-xs truncate px-4 py-3 text-slate-500" title={a.description}>{a.description}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(a.date)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {view === "Accepted" && (
                                                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Accepted</span>
                                                    )}
                                                    {view !== "Accepted" && (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => setConfirm({ type: "accept", item: a })}
                                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                        >
                                                            Accept
                                                        </button>
                                                    )}
                                                    {view === "Pending" && isAdmin && (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => setConfirm({ type: "wait", item: a })}
                                                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                                        >
                                                            Wait
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => setConfirm({ type: "delete", item: a })}
                                                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {permissionMode && isAdmin && (
                    <form onSubmit={sendShare} className="mt-5 max-w-3xl border-t border-slate-200 pt-5">
                        <h2 className="text-base font-semibold text-slate-800">Share selected appointments</h2>
                        <p className="mt-1 text-sm text-slate-500">{selectedIds.length} appointment{selectedIds.length === 1 ? "" : "s"} selected</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <label className="text-sm font-medium text-slate-700">
                                Contact email
                                <input type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                            </label>
                            <label className="text-sm font-medium text-slate-700">
                                Access expires
                                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                            </label>
                            <button type="submit" disabled={!selectedIds.length || shareLoading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                                {shareLoading ? "Sending..." : "Send access link"}
                            </button>
                        </div>
                        {shareError && <p role="alert" className="mt-2 text-sm text-red-600">{shareError}</p>}
                        {shareMessage && <p role="status" className="mt-2 text-sm text-emerald-700">{shareMessage}</p>}
                        <div className="mt-6 overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                    <tr><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Action</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {shareItems.map((item) => {
                                        const expired = new Date(item.expiresAt) <= new Date();
                                        const disabled = Boolean(item.revokedAt) || expired;
                                        return (
                                            <tr key={item._id}>
                                                <td className="px-4 py-3">{item.contactEmail}</td>
                                                <td className="px-4 py-3">{new Date(item.expiresAt).toLocaleString()}</td>
                                                <td className="px-4 py-3">{item.revokedAt ? "Revoked" : expired ? "Expired" : "Active"}</td>
                                                <td className="px-4 py-3">
                                                    <button type="button" disabled={disabled || revokingId === item._id} onClick={() => revokeShare(item._id)} className="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:text-slate-400">
                                                        {revokingId === item._id ? "Revoking..." : "Revoke"}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!shareItems.length && <tr><td colSpan="4" className="px-4 py-5 text-center text-slate-500">No shared links yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </form>
                )}

                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                    <span>{filtered.length} result{filtered.length !== 1 && "s"}</span>
                    <div className="flex items-center gap-2">
                        <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200 disabled:opacity-40">
                            Prev
                        </button>
                        <span>Page {currentPage} of {totalPages}</span>
                        <button disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200 disabled:opacity-40">
                            Next
                        </button>
                    </div>
                </div>
            </main>

            {/* Confirm modal */}
            {confirm && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-slate-800">{ACTIONS[confirm.type].title}</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            “{confirm.item.title}” ({getCategory(confirm.item)}) requested by <b>{confirm.item.username}</b> on {formatDate(confirm.item.date)}.
                        </p>
                        {confirm.type === "delete" && <p className="mt-2 text-sm font-medium text-red-600">This cannot be undone.</p>}
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setConfirm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                                Cancel
                            </button>
                            <button
                                onClick={runAction}
                                disabled={busyId === confirm.item._id}
                                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${ACTIONS[confirm.type].buttonClass}`}
                            >
                                {busyId === confirm.item._id ? "Please wait..." : ACTIONS[confirm.type].button}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}