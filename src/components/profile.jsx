import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCookies } from "react-cookie";
import axios from "../api";

export function Profile() {
    const [profile, setProfile] = useState({ name: "", phone: "", password: "" });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [, , removeCookie] = useCookies(["username", "role"]);
    const navigate = useNavigate();

    useEffect(() => {
        axios.get("/profile")
            .then(({ data }) => setProfile((current) => ({ ...current, ...data })))
            .catch((err) => setError(err.response?.data?.error || "Could not load profile."))
            .finally(() => setLoading(false));
    }, []);

    function handleChange(event) {
        setProfile((current) => ({ ...current, [event.target.name]: event.target.value }));
    }

    function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setMessage("");
        setSaving(true);
        const { name, phone, password } = profile;
        axios.put("/profile", { name, phone, ...(password ? { password } : {}) })
            .then(() => {
                setProfile((current) => ({ ...current, password: "" }));
                setMessage("Profile updated.");
            })
            .catch((err) => setError(err.response?.data?.error || "Could not update profile."))
            .finally(() => setSaving(false));
    }

    function signOut() {
        axios.post("/logout").catch(() => {}).finally(() => {
            removeCookie("username", { path: "/" });
            removeCookie("role", { path: "/" });
            navigate("/login");
        });
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
            <section className="mx-auto max-w-xl">
                <header className="mb-6 flex items-center justify-between border-b border-slate-200 pb-5">
                    <h1 className="text-2xl font-semibold">Edit Profile</h1>
                    <button type="button" onClick={signOut} className="text-sm font-medium text-rose-600 hover:text-rose-700">Sign out</button>
                </header>
                {loading ? <p role="status" className="py-8 text-slate-500">Loading profile...</p> : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">
                            Name
                            <input name="name" value={profile.name} onChange={handleChange} maxLength={80} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Phone
                            <input name="phone" type="tel" value={profile.phone} onChange={handleChange} maxLength={30} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            New password
                            <input name="password" type="password" value={profile.password} onChange={handleChange} minLength={8} autoComplete="new-password" placeholder="Leave blank to keep current password" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                        </label>
                        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
                        <div className="flex gap-3 pt-2">
                            <button type="submit" disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? "Saving..." : "Save profile"}</button>
                            <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Back</button>
                        </div>
                    </form>
                )}
            </section>
        </main>
    );
}