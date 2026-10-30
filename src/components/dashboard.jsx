import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "../api";
import { useCookies } from "react-cookie";

/* =====================================================================
   HELPERS (outside the component so they are not re-created every render)
   ===================================================================== */

// Categories: icon + colours + booking rules.
// duration = minutes per visit, open/close = working hours, closedDays = 0 (Sun) ... 6 (Sat)
// Full class names so Tailwind can see them.
const CATEGORIES = {
    Health:  { icon: "bi-heart-pulse",     duration: 30, open: 9,  close: 17, closedDays: [0],    soft: "bg-rose-100 text-rose-600",     bar: "bg-rose-500",   active: "border-rose-500 bg-rose-50 text-rose-700" },
    Dental:  { icon: "bi-emoji-smile",     duration: 45, open: 10, close: 18, closedDays: [0],    soft: "bg-sky-100 text-sky-600",       bar: "bg-sky-500",    active: "border-sky-500 bg-sky-50 text-sky-700" },
    Meeting: { icon: "bi-people",          duration: 60, open: 9,  close: 18, closedDays: [0, 6], soft: "bg-indigo-100 text-indigo-600", bar: "bg-indigo-500", active: "border-indigo-500 bg-indigo-50 text-indigo-700" },
    Salon:   { icon: "bi-scissors",        duration: 45, open: 10, close: 20, closedDays: [1],    soft: "bg-violet-100 text-violet-600", bar: "bg-violet-500", active: "border-violet-500 bg-violet-50 text-violet-700" },
    Fitness: { icon: "bi-activity",        duration: 60, open: 6,  close: 21, closedDays: [],     soft: "bg-orange-100 text-orange-600", bar: "bg-orange-500", active: "border-orange-500 bg-orange-50 text-orange-700" },
    Other:   { icon: "bi-calendar2-event", duration: 30, open: 9,  close: 18, closedDays: [0],    soft: "bg-slate-200 text-slate-600",   bar: "bg-slate-500",  active: "border-slate-500 bg-slate-100 text-slate-700" },
};
const CATEGORY_NAMES = Object.keys(CATEGORIES);

// Booking status is worked out from `status` + the date.
const STATES = {
    Pending:   { label: "Pending",   icon: "bi-hourglass-split",         badge: "bg-amber-100 text-amber-700",     dot: "bg-amber-400" },
    Waited:    { label: "Waited",    icon: "bi-pause-circle-fill",       badge: "bg-sky-100 text-sky-700",         dot: "bg-sky-500" },
    Booked:    { label: "Booked",    icon: "bi-check-circle-fill",       badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    Completed: { label: "Completed", icon: "bi-flag-fill",               badge: "bg-slate-200 text-slate-600",     dot: "bg-slate-400" },
    Expired:   { label: "Expired",   icon: "bi-exclamation-circle-fill", badge: "bg-rose-100 text-rose-700",       dot: "bg-rose-400" },
};

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-11-05" -> local Date (avoids the timezone shift of new Date("2026-11-05"))
function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function toKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
}

function daysFromToday(str) {
    const date = parseDate(str);
    if (!date) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date - today) / 86400000);
}

function relativeLabel(str) {
    const n = daysFromToday(str);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n === -1) return "Yesterday";
    return n > 0 ? `In ${n} days` : `${Math.abs(n)} days ago`;
}

function formatDate(str) {
    const date = parseDate(str);
    return date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";
}

function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatHour(h) {
    return formatTime(`${String(h).padStart(2, "0")}:00`);
}

function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function fromMinutes(min) {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function getCategory(name) {
    return CATEGORIES[name] || CATEGORIES.Other;
}

function durationOf(name) {
    return getCategory(name).duration;
}

// "9:00 AM - 9:30 AM"
function formatRange(item) {
    if (!item.time) return "";
    const end = fromMinutes(toMinutes(item.time) + durationOf(item.category));
    return `${formatTime(item.time)} - ${formatTime(end)}`;
}

// All start times a category offers in one day
function genSlots(categoryName) {
    const c = getCategory(categoryName);
    const slots = [];
    for (let start = c.open * 60; start + c.duration <= c.close * 60; start += c.duration) {
        slots.push(fromMinutes(start));
    }
    return slots;
}

function isClosed(categoryName, dateStr) {
    const date = parseDate(dateStr);
    return !!date && getCategory(categoryName).closedDays.includes(date.getDay());
}

// next few days the category is open (for the quick date chips)
function nextOpenDays(categoryName, count) {
    const out = [];
    for (let i = 0; i < 30 && out.length < count; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (getCategory(categoryName).closedDays.includes(d.getDay())) continue;
        out.push({
            key: toKey(d),
            label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })
        });
    }
    return out;
}

function rangesOverlap(startA, lenA, startB, lenB) {
    return startA < startB + lenB && startB < startA + lenA;
}

function getState(item) {
    const past = daysFromToday(item.date) < 0;
    const status = String(item.status || "pending").toLowerCase();
    const accepted = status === "accepted";
    if (accepted) return past ? "Completed" : "Booked";
    if (status === "waited" || status === "waiting") return "Waited";
    return past ? "Expired" : "Pending";
}

function groupOf(state) {
    return state === "Completed" || state === "Expired" ? "Past" : state;
}

function sortKey(item) {
    return `${item.date || ""} ${item.time || ""}`;
}

// ---- add to calendar (Google Calendar link + .ics file) ----
function calStamp(dateStr, hhmm) {
    return `${dateStr.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;
}

function calTimes(item) {
    const start = item.time || "09:00";
    const end = fromMinutes(toMinutes(start) + durationOf(item.category));
    return { start: calStamp(item.date, start), end: calStamp(item.date, end) };
}

function googleCalendarUrl(item) {
    const { start, end } = calTimes(item);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title || "Appointment")}&dates=${start}/${end}&details=${encodeURIComponent(item.description || "")}`;
}

function downloadIcs(item) {
    const { start, end } = calTimes(item);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Workspace//Appointments//EN", "BEGIN:VEVENT",
        `UID:${item._id}@workspace`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${end}`,
        `SUMMARY:${item.title || "Appointment"}`, `DESCRIPTION:${(item.description || "").replace(/\n/g, " ")}`,
        "END:VEVENT", "END:VCALENDAR"
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.title || "appointment"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}

const emptyForm = { title: "", description: "", date: "", time: "", category: "Health" };

/* ---------- small reusable pieces ---------- */

function StatusBadge({ state }) {
    const s = STATES[state];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.badge}`}>
            <i className={`bi ${s.icon}`}></i> {s.label}
        </span>
    );
}

function CategoryIcon({ category, size = "h-10 w-10 text-lg" }) {
    const c = getCategory(category);
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-xl ${size} ${c.soft}`}>
            <i className={`bi ${c.icon}`}></i>
        </span>
    );
}

// numbers count up when the dashboard loads
function CountUp({ value }) {
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [n, setN] = useState(() => prefersReducedMotion ? value : 0);
    useEffect(() => {
        if (prefersReducedMotion) {
            const frame = requestAnimationFrame(() => setN(value));
            return () => cancelAnimationFrame(frame);
        }
        let raf;
        const startTime = performance.now();
        const tick = (now) => {
            const p = Math.min((now - startTime) / 600, 1);
            setN(Math.round(value * p));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value, prefersReducedMotion]);
    return <>{n}</>;
}

// Pending/Expired -> only "Requested" is shown.
// After the admin accepts -> Confirmed and Completed are shown
// (Confirmed is ticked right away, Completed once the appointment date has passed).
function Stepper({ state }) {
    const accepted = state === "Booked" || state === "Completed";
    const steps = accepted ? ["Confirmed", "Completed"] : ["Requested"];
    const reached = !accepted ? 0 : state === "Completed" ? 1 : 0;
    return (
        <div className="flex items-center">
            {steps.map((label, i) => (
                <div key={label} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] transition-colors duration-500 ${i <= reached ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"}`}>
                            {i <= reached ? <i className="bi bi-check-lg"></i> : i + 1}
                        </span>
                        <span className={`text-[11px] ${i <= reached ? "font-medium text-slate-700" : "text-slate-400"}`}>{label}</span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`mx-2 mb-4 h-0.5 flex-1 rounded transition-colors duration-500 ${i < reached ? "bg-indigo-600" : "bg-slate-200"}`}></div>
                    )}
                </div>
            ))}
        </div>
    );
}

// collapsible block used in the left menu
function SideSection({ id, title, icon, open, onToggle, children }) {
    return (
        <div id={id} className="mt-5 border-t border-slate-100 pt-4">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="mb-2 flex w-full items-center justify-between px-1 text-sm font-semibold text-slate-700 transition hover:text-indigo-600"
            >
                <span className="flex items-center gap-2"><i className={`bi ${icon} text-indigo-500`}></i> {title}</span>
                <i className={`bi bi-chevron-down text-xs text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}></i>
            </button>
            <div aria-hidden={!open} className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">{children}</div>
            </div>
        </div>
    );
}

/* =====================================================================
   COMPONENT
   ===================================================================== */

export function Dashboard() {
    const [appointments, setAppointment] = useState([]);
    const [cookie, , removeCookie] = useCookies(['username', 'role'])
    const [editAppointment, setEditAppointment] = useState({ ...emptyForm });
    const [addAppointment, setAddAppointment] = useState({ ...emptyForm });

    // text typed in the search box
    const [searchText, setSearchText] = useState("");
    const searchRef = useRef(null);

    // ---- filters / calendar ----
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [statusFilter, setStatusFilter] = useState("All");
    const [sortAsc, setSortAsc] = useState(true);
    const [selectedDate, setSelectedDate] = useState(null);      // "YYYY-MM-DD" or null
    const [calMonth, setCalMonth] = useState(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), 1);
    });
    // which left-menu blocks are open (calendar + week start closed on phones to save space)
    const [openSections, setOpenSections] = useState(() => {
        const wide = typeof window !== "undefined" && window.innerWidth >= 768;
        return { calendar: wide, week: wide, shortcuts: false };
    });
    // ---- UI-only state (modals, sidebar, toast) ----
    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showBooked, setShowBooked] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMsg, setToastMsg] = useState({ title: "", text: "", type: "success" });
    const [deleteTarget, setDeleteTarget] = useState(null);       // appointment waiting for delete confirm
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();

    const LoadAppointments = useCallback(() => {
        axios.get("/appointments", { params: { username: cookie.username } })
            .then(response => {
                const filteredAppointment = response.data

                setAppointment(filteredAppointment);
            })
            .catch(error => {
                console.log(error);
            })
            .finally(() => setLoading(false));
    }, [cookie.username]);


    useEffect(() => {
        LoadAppointments();
    }, [LoadAppointments]);


    function handleSignout() {
        axios.post("/logout").catch(() => {}).finally(() => {
            removeCookie('username', { path: '/' });
            removeCookie('role', { path: '/' });
            navigate('/login');
        });
    }

    useEffect(() => {
        if (!cookie.username) {
            navigate('/login')
        }
    }, [cookie.username, navigate]);

    // auto-hide the toast after 3 seconds
    useEffect(() => {
        if (!showToast) return;
        const timer = setTimeout(() => setShowToast(false), 3000);
        return () => clearTimeout(timer);
    }, [showToast]);

    // keyboard shortcuts: N new, / search, B booked panel, Esc close
    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") {
                setShowAdd(false);
                setShowEdit(false);
                setShowBooked(false);
                setDeleteTarget(null);
                return;
            }
            const tag = e.target.tagName;
            const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
            if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
            if (showAdd || showEdit || showBooked || deleteTarget) return;

            const key = e.key.toLowerCase();
            if (key === "n") { e.preventDefault(); openAdd(); }
            else if (key === "/") { e.preventDefault(); searchRef.current?.focus(); }
            else if (key === "t") { goToday(); }
            else if (key === "b") { setShowBooked(true); }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    function notify(title, text, type = "success") {
        setToastMsg({ title, text, type });
        setShowToast(true);
    }

    function handleChange(e) {
        setAddAppointment({ ...addAppointment, [e.target.name]: e.target.value });
    }

    function openAdd(dateKey, category) {
        const cat = category || (categoryFilter !== "All" ? categoryFilter : emptyForm.category);
        setAddAppointment({ ...emptyForm, category: cat, date: dateKey || "" });
        setShowAdd(true);
    }

    function handleEditClick(item) {
        setEditAppointment({
            _id: item._id,
            title: item.title,
            description: item.description,
            date: item.date,
            time: item.time || "",
            category: item.category || "Other"
        });
        setShowEdit(true);
    }

    function handleEditInputClick(e) {
        setEditAppointment({
            ...editAppointment,
            [e.target.name]: e.target.value
        });
    }

    // checks closed days, double booking. Returns an error message or null.
    function validateSlot(values, excludeId, requireTime) {
        if (!values.time) return requireTime ? "Pick a time slot for your appointment." : null;
        if (isClosed(values.category, values.date)) {
            return `${values.category} is closed on ${DAY_NAMES[parseDate(values.date).getDay()]}s.`;
        }
        const start = toMinutes(values.time);
        const clash = appointments.find(a =>
            a._id !== excludeId && a.date === values.date && a.time &&
            rangesOverlap(start, durationOf(values.category), toMinutes(a.time), durationOf(a.category))
        );
        return clash ? `This time overlaps with "${clash.title}" (${formatRange(clash)}).` : null;
    }

    function handleEditSubmit(e) {
        e.preventDefault();

        const problem = validateSlot(editAppointment, editAppointment._id, false);
        if (problem) {
            notify("Can't save this time", problem, "error");
            return;
        }

        axios.put(`/edit-appointment/${editAppointment._id}`, editAppointment)
            .then(() => {
                LoadAppointments();
                setShowEdit(false);
                notify("Saved", "Your changes were saved.");
            })
            .catch((error) => {
                console.log(error);
            })
    }

    function handleDelete(id) {
        axios.delete(`/delete-appointment/${id}`)
            .then(() => {
                LoadAppointments();
                setDeleteTarget(null);
                notify("Removed", "The appointment was deleted.");
            })
            .catch(error => console.log(error));
    }


    function handleSubmit(e) {
        e.preventDefault();

        const problem = validateSlot(addAppointment, null, true);
        if (problem) {
            notify("Can't book this time", problem, "error");
            return;
        }

        const appointmentData = { ...addAppointment, username: cookie.username };

        axios.post("/add-appointment", appointmentData)
            .then(() => {
                setAddAppointment({ ...emptyForm });

                LoadAppointments();
                setShowAdd(false);
                notify("Request sent", "Your appointment was added and is waiting for confirmation.");
                // jump the calendar to the month of the new booking
                const d = parseDate(appointmentData.date);
                if (d) setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            })
            .catch((error) => {
                console.error("Error adding appointment:", error);
            });
    }

    function goToday() {
        const n = new Date();
        setCalMonth(new Date(n.getFullYear(), n.getMonth(), 1));
        setSelectedDate(toKey(n));
        setOpenSections(o => ({ ...o, calendar: true }));
    }

    function pickDate(key) {
        const d = parseDate(key);
        setSelectedDate(key);
        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        setOpenSections(o => ({ ...o, calendar: true }));
    }

    function toggleSection(name) {
        setOpenSections(o => ({ ...o, [name]: !o[name] }));
    }

    /* ---------------- derived data ---------------- */

    // keep only the appointments that match search + category + status + selected calendar date
    const filteredAppointments = useMemo(() => {
        const q = searchText.toLowerCase();
        return appointments
            .filter(item => {
                const matchesSearch = !q || [item.title, item.description, item.date, item.category]
                    .some(v => v?.toLowerCase().includes(q));
                const matchesCategory = categoryFilter === "All" || (item.category || "Other") === categoryFilter;
                const matchesStatus = statusFilter === "All" || groupOf(getState(item)) === statusFilter;
                const matchesDate = !selectedDate || item.date === selectedDate;
                return matchesSearch && matchesCategory && matchesStatus && matchesDate;
            })
            .sort((a, b) => sortAsc ? sortKey(a).localeCompare(sortKey(b)) : sortKey(b).localeCompare(sortKey(a)));
    }, [appointments, searchText, categoryFilter, statusFilter, selectedDate, sortAsc]);

    // date -> list of appointments (the mini calendar follows the category filter)
    const byDate = useMemo(() => {
        const map = {};
        appointments.forEach(item => {
            if (!item.date) return;
            if (categoryFilter !== "All" && (item.category || "Other") !== categoryFilter) return;
            (map[item.date] = map[item.date] || []).push(item);
        });
        return map;
    }, [appointments, categoryFilter]);

    const stateCounts = useMemo(() => {
        const c = { All: appointments.length, Pending: 0, Waited: 0, Booked: 0, Past: 0 };
        appointments.forEach(item => { c[groupOf(getState(item))]++; });
        return c;
    }, [appointments]);

    const upcoming = useMemo(
        () => appointments
            .filter(item => daysFromToday(item.date) >= 0)
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
        [appointments]
    );
    const nextUp = upcoming[0];
    const nextSevenDays = upcoming.filter(item => daysFromToday(item.date) <= 7).length;

    const todayKey = toKey(new Date());
    const todaysItems = appointments
        .filter(item => item.date === todayKey)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    const pendingCount = appointments.filter(item => String(item.status || "").toLowerCase() !== "accepted").length;
    const confirmedRate = appointments.length
        ? Math.round(((appointments.length - pendingCount) / appointments.length) * 100)
        : 0;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    // calendar grid
    const calYear = calMonth.getFullYear();
    const calMon = calMonth.getMonth();
    const firstWeekday = new Date(calYear, calMon, 1).getDay();
    const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
    const calCells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

    function moveMonth(step) {
        setCalMonth(new Date(calYear, calMon + step, 1));
    }

    // next 7 days, for the little bar chart in the left menu
    const weekBars = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const key = toKey(d);
        return { key, label: WEEK_DAYS[d.getDay()], count: (byDate[key] || []).length };
    });
    const weekMax = Math.max(1, ...weekBars.map(b => b.count));
    const weekTotal = weekBars.reduce((sum, b) => sum + b.count, 0);

    function clearFilters() {
        setSearchText("");
        setCategoryFilter("All");
        setStatusFilter("All");
        setSelectedDate(null);
    }

    const hasFilters = searchText || categoryFilter !== "All" || statusFilter !== "All" || selectedDate;

    // free / taken / past for one time slot
    function slotState(slot, dateStr, categoryName, excludeId) {
        const start = toMinutes(slot);
        if (daysFromToday(dateStr) < 0) return "past";
        if (dateStr === todayKey && start <= nowMinutes) return "past";
        const taken = appointments.some(a =>
            a._id !== excludeId && a.date === dateStr && a.time &&
            rangesOverlap(start, durationOf(categoryName), toMinutes(a.time), durationOf(a.category))
        );
        return taken ? "taken" : "free";
    }

    // small reusable class strings
    const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

    // Form fields shared by the Add and Edit modals.
    // Called like a function (not <Component />) so inputs keep focus while typing.
    //   onChange -> text inputs, patch -> {field: value} updates, excludeId -> ignore this booking when checking clashes
    function renderFields(values, onChange, patch, isAdd, excludeId) {
        const cat = getCategory(values.category);
        const slots = genSlots(values.category);
        const closed = values.date && isClosed(values.category, values.date);
        const states = values.date && !closed ? slots.map(s => slotState(s, values.date, values.category, excludeId)) : [];
        const openCount = states.filter(s => s === "free").length;
        const quickDays = nextOpenDays(values.category, 5);

        return (
            <div className="space-y-4 p-5">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                    <input type="text" name="title" value={values.title} onChange={onChange} className={inputClass} required />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                    <div className="grid grid-cols-3 gap-2">
                        {CATEGORY_NAMES.map(name => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => patch({ category: name, time: "" })}
                                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition active:scale-95 ${values.category === name ? CATEGORIES[name].active : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                            >
                                <i className={`bi ${CATEGORIES[name].icon}`}></i> {name}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        <i className="bi bi-info-circle mr-1"></i>
                        {cat.duration} min visits, {formatHour(cat.open)} to {formatHour(cat.close)}
                        {cat.closedDays.length > 0 && <>, closed {cat.closedDays.map(d => DAY_NAMES[d]).join(", ")}</>}
                    </p>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {quickDays.map(day => (
                            <button
                                key={day.key}
                                type="button"
                                onClick={() => patch({ date: day.key, time: "" })}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 ${values.date === day.key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-indigo-50"}`}
                            >
                                {day.label}
                            </button>
                        ))}
                    </div>
                    <input type="date" name="date" value={values.date} onChange={(e) => patch({ date: e.target.value, time: "" })} min={isAdd ? todayKey : undefined} className={inputClass} required />
                </div>

                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700">Time slot</label>
                        {values.date && !closed && (
                            <span className={`text-xs font-medium ${openCount > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {openCount} of {slots.length} open
                            </span>
                        )}
                    </div>

                    {!values.date ? (
                        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
                            <i className="bi bi-calendar-event mr-1"></i>Pick a date to see open times.
                        </p>
                    ) : closed ? (
                        <p className="rounded-lg bg-rose-50 px-3 py-4 text-center text-xs text-rose-600">
                            <i className="bi bi-slash-circle mr-1"></i>
                            {values.category} is closed on {DAY_NAMES[parseDate(values.date).getDay()]}s. Choose another date.
                        </p>
                    ) : (
                        <div key={`${values.date}-${values.category}`} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {slots.map((slot, i) => {
                                const st = states[i];
                                const picked = values.time === slot;
                                return (
                                    <button
                                        key={slot}
                                        type="button"
                                        disabled={st !== "free"}
                                        onClick={() => patch({ time: slot })}
                                        style={{ animationDelay: `${i * 25}ms` }}
                                        title={st === "taken" ? "Already booked" : st === "past" ? "This time has passed" : "Available"}
                                        className={`slot-in rounded-lg border px-2 py-2 text-xs font-medium transition active:scale-95 ${picked ? "border-indigo-600 bg-indigo-600 text-white shadow" : st === "free" ? "border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through"}`}
                                    >
                                        {formatTime(slot)}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {values.time && !closed && (
                        <p className="mt-2 text-xs font-medium text-indigo-600">
                            <i className="bi bi-clock mr-1"></i>
                            {formatRange({ time: values.time, category: values.category })}
                        </p>
                    )}
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                    <textarea rows={3} name="description" value={values.description} onChange={onChange} className={inputClass} required></textarea>
                </div>
            </div>
        );
    }

    return cookie['username'] ? (
        <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">

            {/* animation keyframes (kept inside the component so nothing else changes) */}
            <style>{`
                @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes toastIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes toastBar { from { width: 100%; } to { width: 0%; } }
                @keyframes growY { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes growX { from { transform: scaleX(0); } to { transform: scaleX(1); } }
                @keyframes cardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                @keyframes slotIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
                @keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.5); } 100% { box-shadow: 0 0 0 8px rgba(99,102,241,0); } }
                @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
                .row-in { opacity: 0; animation: rowIn 0.35s ease-out forwards; }
                .toast-in { animation: toastIn 0.3s ease-out; }
                .toast-bar { animation: toastBar 3s linear forwards; }
                .grow-y { transform-origin: bottom; animation: growY 0.6s ease-out both; }
                .grow-x { transform-origin: left; animation: growX 0.7s ease-out both; }
                .card-in { opacity: 0; animation: cardIn 0.45s ease-out forwards; }
                .fade-in { animation: fadeIn 0.25s ease-out; }
                .slot-in { opacity: 0; animation: slotIn 0.25s ease-out forwards; }
                .now-ping { animation: ping 1.6s ease-out infinite; }
                .skeleton { background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%); background-size: 800px 100%; animation: shimmer 1.4s infinite linear; }
                /* menu links: plain CSS so Bootstrap's blue underlined <a> style cannot win */
                a.side-link { text-decoration: none; color: #64748b; transition: background-color 0.15s, color 0.15s; }
                a.side-link:hover { text-decoration: none; color: #1e293b; background-color: #f1f5f9; }
                a.side-link.active, a.side-link.active:hover { color: #4f46e5; background-color: #eef2ff; font-weight: 600; }
                @media (prefers-reduced-motion: reduce) {
                    .row-in, .toast-in, .toast-bar, .grow-x, .grow-y, .card-in, .fade-in, .slot-in, .now-ping, .skeleton, .animate-pulse { animation: none; opacity: 1; }
                }
            `}</style>

            {/* ===== TOAST ===== */}
            {showToast && (
                <div className={`toast-in fixed right-4 top-4 z-[60] w-80 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ${toastMsg.type === "error" ? "ring-rose-200" : "ring-emerald-200"}`} role="status">
                    <div className="flex items-start gap-3 p-4">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toastMsg.type === "error" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
                            <i className={`bi text-lg ${toastMsg.type === "error" ? "bi-exclamation-lg" : "bi-check-lg"}`}></i>
                        </span>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800">{toastMsg.title}</p>
                            <p className="text-xs text-slate-500">{toastMsg.text}</p>
                        </div>
                        <button type="button" onClick={() => setShowToast(false)} className="text-slate-400 transition hover:text-slate-600" aria-label="Close message">
                            <i className="bi bi-x-lg text-xs"></i>
                        </button>
                    </div>
                    <div className={`h-1 ${toastMsg.type === "error" ? "bg-rose-100" : "bg-emerald-100"}`}>
                        <div className={`toast-bar h-full ${toastMsg.type === "error" ? "bg-rose-500" : "bg-emerald-500"}`}></div>
                    </div>
                </div>
            )}

            {/* ===== LEFT MENU ===== */}
            <aside className="w-full border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
                <div className="flex items-center gap-2 px-2 py-3 text-2xl font-bold text-indigo-600">
                    <i className="bi bi-calendar2-check"></i> Workspace
                </div>

                {/* profile */}
                <div className="mb-5 mt-2 rounded-xl bg-slate-100 p-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold uppercase text-white">
                            {cookie['username'][0]}
                        </span>
                        <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{cookie['username']}</span>
                            <span className="block whitespace-nowrap text-xs text-slate-500">
                                {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleSignout}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500 hover:text-white active:scale-95"
                    >
                        <i className="bi bi-box-arrow-right"></i> Signout
                    </button>
                    <Link to="/profile" className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                        <i className="bi bi-person-gear"></i> Edit profile
                    </Link>
                </div>

                <nav className="space-y-1">
                    <Link to="/dashboard" className="side-link active flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                        <i className="bi bi-pencil-square"></i> Appointments
                    </Link>
                    <Link to="/dashboard#calendar" className="side-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                        <i className="bi bi-calendar-date"></i> Calendar
                    </Link>
                </nav>

                {/* quick views: one click to filter the list */}
                <div className="mt-5">
                    <div className="mb-2 px-3 text-xs font-medium text-slate-400">Quick views</div>
                    <div className="space-y-1">
                        {[["All", "bi-collection"], ["Pending", "bi-hourglass-split"], ["Waited", "bi-pause-circle"], ["Booked", "bi-check-circle"], ["Past", "bi-clock-history"]].map(([name, icon]) => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => setStatusFilter(name)}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition active:scale-[0.98] ${statusFilter === name ? "bg-indigo-50 font-semibold text-indigo-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                            >
                                <i className={`bi ${icon}`}></i> {name}
                                <span className={`ml-auto rounded-full px-2 text-xs ${statusFilter === name ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{stateCounts[name]}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* MINI CALENDAR */}
                <SideSection id="calendar" title="Calendar" icon="bi-calendar3" open={openSections.calendar} onToggle={() => toggleSection("calendar")}>
                    <div className="px-1 pb-1">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-800">{calMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
                            <div className="flex items-center gap-0.5">
                                <button type="button" onClick={() => moveMonth(-1)} className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 active:scale-90" aria-label="Previous month">
                                    <i className="bi bi-chevron-left"></i>
                                </button>
                                <button type="button" onClick={goToday} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-95">Today</button>
                                <button type="button" onClick={() => moveMonth(1)} className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 active:scale-90" aria-label="Next month">
                                    <i className="bi bi-chevron-right"></i>
                                </button>
                            </div>
                        </div>

                        <div key={`${calYear}-${calMon}-${categoryFilter}`} className="fade-in">
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {WEEK_DAYS.map(d => (
                                    <div key={d} className="pb-1 text-[11px] font-medium text-slate-400">{d}</div>
                                ))}

                                {calCells.map((day, i) => {
                                    if (!day) return <div key={`blank-${i}`}></div>;
                                    const key = toKey(new Date(calYear, calMon, day));
                                    const list = byDate[key] || [];
                                    const isToday = key === todayKey;
                                    const isSelected = key === selectedDate;
                                    const closedDay = categoryFilter !== "All" && isClosed(categoryFilter, key);
                                    const pastDay = daysFromToday(key) < 0;
                                    const canBook = !closedDay && !pastDay;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            title={closedDay ? `${categoryFilter} is closed` : list.length ? `${list.length} appointment${list.length > 1 ? "s" : ""}` : canBook ? "Double-click to book" : ""}
                                            onClick={() => setSelectedDate(isSelected ? null : key)}
                                            onDoubleClick={() => { if (canBook) openAdd(key, categoryFilter !== "All" ? categoryFilter : undefined); }}
                                            className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition active:scale-90
                                                ${isSelected ? "bg-indigo-600 font-semibold text-white shadow"
                                                    : isToday ? "bg-indigo-50 font-semibold text-indigo-700 ring-1 ring-indigo-300"
                                                    : closedDay ? "bg-slate-100/70 text-slate-300"
                                                    : list.length ? "bg-slate-50 font-medium text-slate-800 hover:bg-indigo-50"
                                                    : pastDay ? "text-slate-300 hover:bg-slate-100"
                                                    : "text-slate-600 hover:bg-slate-100"}`}
                                        >
                                            {day}
                                            {list.length > 0 && (
                                                <span className="absolute bottom-0.5 flex gap-0.5">
                                                    {list.slice(0, 3).map(item => (
                                                        <span key={item._id} className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : STATES[getState(item)].dot}`}></span>
                                                    ))}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* legend */}
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            {Object.entries(STATES).map(([name, st]) => (
                                <span key={name} className="inline-flex items-center gap-1">
                                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`}></span> {st.label}
                                </span>
                            ))}
                        </div>

                        {/* selected day */}
                        {selectedDate && (
                            <div className="row-in mt-3 rounded-lg bg-slate-50 p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-slate-800">
                                        {formatDate(selectedDate)} <span className="font-normal text-slate-400">({relativeLabel(selectedDate)})</span>
                                    </div>
                                    <button type="button" onClick={() => setSelectedDate(null)} className="text-xs text-slate-400 transition hover:text-slate-700">Clear</button>
                                </div>
                                {(byDate[selectedDate] || []).length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                        {byDate[selectedDate]
                                            .slice()
                                            .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
                                            .map(item => (
                                                <div key={item._id}>
                                                    <button type="button" onClick={() => handleEditClick(item)} title="Click to reschedule" className="flex w-full items-center gap-2 rounded-md p-1 text-left text-sm transition hover:bg-white">
                                                        <CategoryIcon category={item.category || "Other"} size="h-7 w-7 text-sm" />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-slate-700">{item.title}</span>
                                                            <span className="block text-[11px] text-slate-400">{formatRange(item) || "No time set"}</span>
                                                        </span>
                                                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATES[getState(item)].dot}`}></span>
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <div className="mt-1 text-xs text-slate-500">No appointments on this day.</div>
                                )}
                                {daysFromToday(selectedDate) >= 0 && !(categoryFilter !== "All" && isClosed(categoryFilter, selectedDate)) && (
                                    <button type="button" onClick={() => openAdd(selectedDate, categoryFilter !== "All" ? categoryFilter : undefined)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 active:scale-95">
                                        <i className="bi bi-plus-circle"></i> Book on this date
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </SideSection>

                {/* NEXT 7 DAYS */}
                <SideSection title="Next 7 days" icon="bi-bar-chart" open={openSections.week} onToggle={() => toggleSection("week")}>
                    <div className="px-1 pb-1">
                        <div className="mb-3 text-xs text-slate-500">
                            {weekTotal > 0 ? `${weekTotal} appointment${weekTotal > 1 ? "s" : ""} coming up. Tap a bar to see that day.` : "Nothing booked this week."}
                        </div>
                        <div className="grid grid-cols-7 items-end gap-1.5">
                            {weekBars.map((bar, i) => (
                                <button
                                    key={bar.key}
                                    type="button"
                                    onClick={() => pickDate(bar.key)}
                                    title={`${bar.count} on ${formatDate(bar.key)}`}
                                    className="group flex flex-col items-center gap-1"
                                >
                                    <span className="text-[11px] font-medium text-slate-500">{bar.count || ""}</span>
                                    <span className="flex h-14 w-full items-end">
                                        <span
                                            className={`grow-y block w-full rounded-t-md transition-colors ${bar.count ? "bg-indigo-400 group-hover:bg-indigo-600" : "bg-slate-200 group-hover:bg-slate-300"} ${bar.key === selectedDate ? "!bg-indigo-600" : ""}`}
                                            style={{ height: bar.count ? `${Math.max(25, (bar.count / weekMax) * 100)}%` : "4px", animationDelay: `${i * 60}ms` }}
                                        ></span>
                                    </span>
                                    <span className={`text-[11px] ${i === 0 ? "font-semibold text-indigo-600" : "text-slate-400"}`}>{i === 0 ? "Now" : bar.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </SideSection>

                {/* keyboard shortcuts */}
                <SideSection title="Shortcuts" icon="bi-keyboard" open={openSections.shortcuts} onToggle={() => toggleSection("shortcuts")}>
                    <div className="space-y-2 px-1 pb-1 text-xs text-slate-500">
                        {[["N", "New appointment"], ["/", "Search"], ["T", "Jump to today"], ["B", "Booked list"], ["Esc", "Close window"]].map(([k, text]) => (
                            <div key={k} className="flex items-center justify-between gap-2">
                                <span>{text}</span>
                                <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{k}</span>
                            </div>
                        ))}
                    </div>
                </SideSection>
            </aside>


            {/* ===== MAIN AREA ===== */}
            <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">

                {/* page title */}
                <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900">{greeting}, {cookie['username']}</h3>
                        <p className="text-sm text-slate-500">
                            {todaysItems.length > 0
                                ? `You have ${todaysItems.length} appointment${todaysItems.length > 1 ? "s" : ""} today.`
                                : nextSevenDays > 0
                                    ? `You have ${nextSevenDays} appointment${nextSevenDays > 1 ? "s" : ""} in the next 7 days.`
                                    : "Nothing scheduled for the next 7 days."}
                        </p>
                    </div>
                    <p className="text-sm text-slate-400">
                        <i className="bi bi-clock mr-1"></i>
                        {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                </div>

                {/* search + buttons */}
                <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex w-full min-w-0 max-w-lg items-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-indigo-400">
                        <span className="pl-3 text-slate-400"><i className="bi bi-search"></i></span>
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search by title, description, category or date"
                            className="w-full bg-transparent px-3 py-2.5 text-sm outline-none"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        {searchText ? (
                            <button
                                type="button"
                                className="mr-1 rounded-md bg-amber-400 px-2.5 py-1.5 text-sm text-amber-950 transition hover:bg-amber-500"
                                onClick={() => setSearchText("")}
                                aria-label="Clear search"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        ) : (
                            <span className="mr-2 hidden rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 sm:block">/</span>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3 xl:shrink-0 xl:flex-nowrap">
                        <button onClick={() => setShowBooked(true)} className="relative inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-indigo-500 bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-95">
                            <i className="bi bi-journal-check"></i> Booked Appointments
                            <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
                                {appointments.length}
                            </span>
                        </button>
                        <button type="button" onClick={() => openAdd()} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-95" >
                            <i className="bi bi-plus-circle"></i> Book New Appointment
                        </button>
                    </div>
                </div>

                {/* summary cards (click one to filter the list) */}
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: "Total Appointments", value: appointments.length, icon: "bi-calendar-check", color: "text-indigo-500 bg-indigo-50", note: `${confirmedRate}% confirmed`, filter: "All" },
                        { label: "Confirmed", value: stateCounts.Booked, icon: "bi-check2-circle", color: "text-emerald-500 bg-emerald-50", note: "Upcoming and booked", filter: "Booked" },
                        { label: "Awaiting Confirmation", value: pendingCount, icon: "bi-hourglass-split", color: "text-amber-500 bg-amber-50", note: "Pending or expired", filter: "Pending" },
                        { label: "Next 7 Days", value: nextSevenDays, icon: "bi-calendar-week", color: "text-sky-500 bg-sky-50", note: nextUp ? `Next: ${relativeLabel(nextUp.date).toLowerCase()}` : "Nothing coming up", filter: "All" },
                    ].map((card, i) => (
                        <button
                            type="button"
                            key={card.label}
                            onClick={() => setStatusFilter(card.filter)}
                            style={{ animationDelay: `${i * 70}ms` }}
                            className="card-in flex w-full items-center justify-between rounded-xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-100 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-indigo-200 active:scale-[0.98]"
                        >
                            <div>
                                <div className="text-xs text-slate-500">{card.label}</div>
                                <div className="text-3xl font-bold text-slate-900"><CountUp value={card.value} /></div>
                                <div className="mt-0.5 text-xs text-slate-400">{card.note}</div>
                            </div>
                            <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${card.color}`}>
                                <i className={`bi ${card.icon}`}></i>
                            </span>
                        </button>
                    ))}
                </div>

                {/* ===== TWO COLUMN AREA: left = next up + list, right = today's schedule (only when you have one) ===== */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

                    {/* ---------- RIGHT COLUMN (shown first on small screens) ---------- */}
                    {todaysItems.length > 0 && (
                    <div className="space-y-6 xl:order-2">

                        {/* TODAY'S SCHEDULE */}
                        {(
                            <div className="card-in rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                                <h5 className="mb-4 font-semibold text-slate-900">
                                    <i className="bi bi-sun mr-2 text-amber-500"></i>Today's schedule
                                </h5>
                                <div className="relative space-y-4 border-l-2 border-slate-100 pl-5">
                                    {todaysItems.map(item => {
                                        const start = item.time ? toMinutes(item.time) : null;
                                        const end = start !== null ? start + durationOf(item.category) : null;
                                        const isNow = start !== null && nowMinutes >= start && nowMinutes < end;
                                        const isDone = end !== null && nowMinutes >= end;
                                        return (
                                            <div key={item._id} className={`relative ${isDone ? "opacity-50" : ""}`}>
                                                <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${isNow ? "now-ping bg-indigo-600" : isDone ? "bg-slate-300" : "bg-indigo-300"}`}></span>
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                                                    {isNow && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Now</span>}
                                                    {isDone && <span className="text-[11px] text-slate-400">Done</span>}
                                                </div>
                                                <p className="text-xs text-slate-400">{formatRange(item) || "No time set"} · {item.category || "Other"}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    {/* ---------- LEFT COLUMN ---------- */}
                    <div className={`min-w-0 space-y-6 xl:order-1 ${todaysItems.length > 0 ? "xl:col-span-2" : "xl:col-span-3"}`}>

                        {/* NEXT UP */}
                        {nextUp && (
                            <div className="card-in overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                                <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 text-white">
                                    <span className="flex items-center gap-2 text-sm font-semibold">
                                        <i className="bi bi-bell"></i> Next appointment
                                    </span>
                                    <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold">{relativeLabel(nextUp.date)}</span>
                                </div>
                                <div className="grid gap-5 p-5 md:grid-cols-2">
                                    <div className="flex items-start gap-3">
                                        <CategoryIcon category={nextUp.category || "Other"} size="h-12 w-12 text-2xl" />
                                        <div className="min-w-0">
                                            <h4 className="truncate text-lg font-semibold text-slate-900">{nextUp.title}</h4>
                                            <p className="line-clamp-2 text-sm text-slate-500">{nextUp.description}</p>
                                            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                                                <span><i className="bi bi-calendar-date mr-1 text-slate-400"></i>{formatDate(nextUp.date)}</span>
                                                {nextUp.time && <span><i className="bi bi-clock mr-1 text-slate-400"></i>{formatRange(nextUp)}</span>}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <a href={googleCalendarUrl(nextUp)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95">
                                                    <i className="bi bi-calendar-plus"></i> Add to Google Calendar
                                                </a>
                                                <button type="button" onClick={() => handleEditClick(nextUp)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95">
                                                    <i className="bi bi-arrow-repeat"></i> Reschedule
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col justify-center gap-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">Booking status</span>
                                            <StatusBadge state={getState(nextUp)} />
                                        </div>
                                        <Stepper state={getState(nextUp)} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ===== TABLE ===== */}
                        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="font-semibold text-slate-900">
                                    Your Appointments
                                    <span className="ml-2 text-sm font-normal text-slate-400">
                                        (showing {filteredAppointments.length} of {appointments.length})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSortAsc(!sortAsc)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95"
                                    >
                                        <i className={`bi ${sortAsc ? "bi-sort-down-alt" : "bi-sort-up"}`}></i>
                                        {sortAsc ? "Soonest first" : "Latest first"}
                                    </button>
                                    {hasFilters && (
                                        <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-500 active:scale-95">
                                            <i className="bi bi-funnel"></i> Reset
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* status tabs */}
                            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
                                {["All", "Pending", "Booked", "Past"].map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setStatusFilter(tab)}
                                        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${statusFilter === tab ? "border-indigo-600 font-semibold text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                                    >
                                        {tab}
                                        <span className={`rounded-full px-1.5 text-xs ${statusFilter === tab ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{stateCounts[tab]}</span>
                                    </button>
                                ))}
                            </div>

                            {/* category chips */}
                            <div className="flex gap-2 overflow-x-auto px-5 py-3">
                                {["All", ...CATEGORY_NAMES].map(name => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => setCategoryFilter(name)}
                                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 ${categoryFilter === name ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                                    >
                                        {name !== "All" && <i className={`bi ${CATEGORIES[name].icon}`}></i>}
                                        {name}
                                    </button>
                                ))}
                            </div>

                            {selectedDate && (
                                <div className="fade-in mx-5 mb-3 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                                    <span><i className="bi bi-calendar-event mr-2"></i>Showing {formatDate(selectedDate)}</span>
                                    <button type="button" onClick={() => setSelectedDate(null)} className="text-indigo-400 transition hover:text-indigo-700" aria-label="Clear date filter">
                                        <i className="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">

                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold">Appointment</th>
                                            <th className="px-5 py-3 font-semibold">Date</th>
                                            <th className="px-5 py-3 font-semibold">Status</th>
                                            <th className="px-5 py-3 font-semibold">Actions</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                        {loading ? (
                                            [0, 1, 2].map(n => (
                                                <tr key={n}>
                                                    <td colSpan="4" className="px-5 py-4"><div className="skeleton h-10 rounded-lg"></div></td>
                                                </tr>
                                            ))
                                        ) : filteredAppointments.length > 0 ?
                                            (
                                                filteredAppointments.map((item, index) => {
                                                    const state = getState(item);
                                                    return (
                                                        <tr
                                                            key={item._id}
                                                            className="row-in transition-colors hover:bg-indigo-50/50"
                                                            style={{ animationDelay: `${index * 40}ms` }}
                                                        >
                                                            <td className="px-5 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <CategoryIcon category={item.category || "Other"} />
                                                                    <div className="min-w-0">
                                                                        <div className="font-semibold text-slate-900">{item.title}</div>
                                                                        <div className="max-w-xs truncate text-xs text-slate-500">{item.description}</div>
                                                                        <div className="mt-0.5 text-[11px] text-slate-400">{item.category || "Other"}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                                                                <div><i className="bi bi-calendar-date mr-1 text-slate-400"></i>{formatDate(item.date)}</div>
                                                                <div className="mt-0.5 text-xs text-slate-400">
                                                                    {item.time && <><i className="bi bi-clock mr-1"></i>{formatRange(item)} · </>}
                                                                    {relativeLabel(item.date)}
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <StatusBadge state={state} />
                                                            </td>
                                                            <td className="whitespace-nowrap px-5 py-3">
                                                                <a
                                                                    href={googleCalendarUrl(item)}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    title="Add to Google Calendar"
                                                                    aria-label="Add to Google Calendar"
                                                                    className="mr-2 inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 active:scale-95"
                                                                >
                                                                    <i className="bi bi-calendar-plus"></i>
                                                                </a>
                                                                <button
                                                                    onClick={() => handleEditClick(item)}
                                                                    type="button"
                                                                    className="mr-2 inline-flex items-center gap-1 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-500 active:scale-95"
                                                                >
                                                                    <i className="bi bi-pencil"></i> Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => setDeleteTarget(item)}
                                                                    type="button"
                                                                    className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-600 active:scale-95"
                                                                >
                                                                    <i className="bi bi-trash"></i> Delete
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="px-5 py-14 text-center text-slate-400">
                                                        <i className="bi bi-calendar-x block text-4xl"></i>
                                                        <span className="mt-2 block text-sm">
                                                            {appointments.length === 0 ? "No appointments yet. Book your first one." : "No appointments match these filters."}
                                                        </span>
                                                        {appointments.length === 0 && (
                                                            <button type="button" onClick={() => openAdd()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95">
                                                                Book New Appointment
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* floating "new appointment" button for phones */}
                <button
                    type="button"
                    onClick={() => openAdd()}
                    aria-label="Book new appointment"
                    className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg transition hover:bg-indigo-700 active:scale-90 md:hidden"
                >
                    <i className="bi bi-plus-lg"></i>
                </button>

                {/* ===== BOOKED APPOINTMENTS SIDEBAR (slide-in panel) ===== */}
                <div className={`fixed inset-0 z-40 transition-opacity duration-300 ${showBooked ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                    <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowBooked(false)}></div>
                    <div className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-out ${showBooked ? "translate-x-0" : "translate-x-full"}`}>
                        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                            <h5 className="text-lg font-semibold text-slate-900">Booked Appointments</h5>
                            <button type="button" onClick={() => setShowBooked(false)} className="text-slate-400 transition hover:text-slate-700" aria-label="Close panel">
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                        <div className="flex-1 space-y-3 overflow-y-auto p-5">
                            {appointments.length > 0 ? (
                                appointments
                                    .slice()
                                    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
                                    .map(item => (
                                        <div key={item._id} className="rounded-lg border-l-4 border-indigo-500 bg-white p-4 shadow-sm transition hover:shadow-md">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <CategoryIcon category={item.category || "Other"} size="h-8 w-8 text-sm" />
                                                    <h6 className="font-semibold text-slate-900">{item.title}</h6>
                                                </div>
                                                <StatusBadge state={getState(item)} />
                                            </div>
                                            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                                            <small className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
                                                <i className="bi bi-calendar-date"></i> {formatDate(item.date)}
                                                {item.time && <> · {formatRange(item)}</>}
                                            </small>
                                            <div className="mt-3 border-t border-slate-100 pt-3">
                                                <Stepper state={getState(item)} />
                                            </div>
                                            <button type="button" onClick={() => downloadIcs(item)} className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95">
                                                <i className="bi bi-download"></i> Download .ics
                                            </button>
                                        </div>
                                    ))
                            ) : (
                                <div className="mt-16 text-center text-slate-400">
                                    <i className="bi bi-calendar-x text-4xl"></i>
                                    <p className="mt-2 text-sm">No booked appointments</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== ADD MODAL ===== */}
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${showAdd ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                    <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowAdd(false)}></div>
                    <div className={`relative max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl transition-all duration-200 ${showAdd ? "translate-y-0 scale-100" : "translate-y-3 scale-95"}`}>
                        <form onSubmit={handleSubmit}>
                            <div className="flex items-center justify-between bg-indigo-600 px-5 py-4 text-white">
                                <h4 className="text-lg font-semibold">Add New Appointment</h4>
                                <button type="button" onClick={() => setShowAdd(false)} className="text-white/80 transition hover:text-white" aria-label="Close">
                                    <i className="bi bi-x-lg"></i>
                                </button>
                            </div>

                            {renderFields(addAppointment, handleChange, (patch) => setAddAppointment({ ...addAppointment, ...patch }), true, null)}

                            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-500 active:scale-95">
                                    Cancel
                                </button>
                                <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95">
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* ===== EDIT MODAL ===== */}
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${showEdit ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                    <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowEdit(false)}></div>
                    <div className={`relative max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl transition-all duration-200 ${showEdit ? "translate-y-0 scale-100" : "translate-y-3 scale-95"}`}>
                        <form onSubmit={handleEditSubmit}>
                            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                                <h4 className="text-lg font-semibold text-slate-900">Edit or reschedule</h4>
                                <button type="button" onClick={() => setShowEdit(false)} className="text-slate-400 transition hover:text-slate-700" aria-label="Close">
                                    <i className="bi bi-x-lg"></i>
                                </button>
                            </div>

                            {renderFields(editAppointment, handleEditInputClick, (patch) => setEditAppointment({ ...editAppointment, ...patch }), false, editAppointment._id)}

                            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                                <button type="button" onClick={() => setShowEdit(false)} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 active:scale-95">
                                    Cancel
                                </button>
                                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-95">
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* ===== DELETE CONFIRM MODAL ===== */}
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${deleteTarget ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                    <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDeleteTarget(null)}></div>
                    <div className={`relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl transition-all duration-200 ${deleteTarget ? "translate-y-0 scale-100" : "translate-y-3 scale-95"}`}>
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">
                            <i className="bi bi-trash"></i>
                        </span>
                        <h4 className="mt-3 text-lg font-semibold text-slate-900">Delete this appointment?</h4>
                        <p className="mt-1 text-sm text-slate-500">
                            "{deleteTarget?.title}" on {formatDate(deleteTarget?.date)} will be removed. This cannot be undone.
                        </p>
                        <div className="mt-5 flex justify-center gap-2">
                            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95">
                                Keep it
                            </button>
                            <button type="button" onClick={() => handleDelete(deleteTarget._id)} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 active:scale-95">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    ) : null;
}