import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "../api";

function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export function ContactView() {
    const { token } = useParams();
    const [appointments, setAppointments] = useState([]);
    const [expiresAt, setExpiresAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        axios.get(`/contact-view/${encodeURIComponent(token)}`)
            .then(({ data }) => {
                if (!active) return;
                setAppointments(data.appointments);
                setExpiresAt(data.expiresAt);
            })
            .catch((err) => {
                if (!active) return;
                setError(err.response?.status === 410 ? "Link expired" : "Unable to load shared appointments.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [token]);

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
            <section className="mx-auto max-w-4xl">
                <header className="mb-6 border-b border-slate-200 pb-5">
                    <h1 className="text-2xl font-semibold">Shared appointments</h1>
                    {expiresAt && <p className="mt-1 text-sm text-slate-500">Access ends {new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>}
                </header>
                {loading ? (
                    <p role="status" className="py-10 text-center text-slate-500">Loading appointments...</p>
                ) : error ? (
                    <p role="alert" className="py-10 text-center font-medium text-rose-700">{error}</p>
                ) : appointments.length === 0 ? (
                    <p className="py-10 text-center text-slate-500">No accepted appointments are available.</p>
                ) : (
                    <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                        {appointments.map((appointment) => (
                            <article key={appointment._id} className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                                <div>
                                    <h2 className="font-semibold">{appointment.title}</h2>
                                    <p className="mt-1 text-sm text-slate-600">{appointment.description}</p>
                                    <p className="mt-2 text-sm text-slate-500">{appointment.category || "Appointment"}</p>
                                </div>
                                <p className="text-sm font-medium text-slate-700">
                                    {formatDate(appointment.date)}{appointment.time ? ` · ${appointment.time}` : ""}
                                </p>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}