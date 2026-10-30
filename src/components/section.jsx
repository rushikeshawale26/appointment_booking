import { lazy, Suspense } from "react";

const Login = lazy(() => import("./login").then((module) => ({ default: module.Login })));

const stats = [
    { value: "10K+", label: "Appointments booked" },
    { value: "98%", label: "On-time bookings" },
    { value: "24/7", label: "Online access" },
];

const features = [
    { icon: "bi-calendar-plus", title: "Easy Booking", text: "Pick a date and add details in a few clicks." },
    { icon: "bi-bell", title: "Status Tracking", text: "See if your appointment is pending or confirmed." },
    { icon: "bi-pencil-square", title: "Edit & Cancel", text: "Change your plans anytime without calling." },
    { icon: "bi-shield-lock", title: "Secure Account", text: "Your appointments are private to your login." },
];

const steps = [
    { title: "Create account", text: "Register with your username and email." },
    { title: "Book appointment", text: "Add a title, description and date." },
    { title: "Track status", text: "View, edit or cancel from your dashboard." },
];

const css = `
    html { scroll-behavior: smooth; }

    .card-hover { transition: transform .3s, box-shadow .3s; }
    .card-hover:hover { transform: translateY(-8px); box-shadow: 0 1rem 2rem rgba(0,0,0,.15) !important; }

    @keyframes fade-up {
        from { opacity: 0; transform: translateY(20px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    .fade-up { animation: fade-up .7s ease-out both; }
`;

export function Section() {
    return (
        <div>
            <style>{css}</style>

            {/* HERO */}
            <section id="home" className="py-5">
                <div className="container">
                    <div className="row align-items-center g-5">
                        <div className="col-lg-6">
                            <span className="badge bg-primary-subtle text-primary mb-3">Online appointment booking</span>
                            <h1 className="display-4 fw-bold">
                                Schedule smarter. <span className="text-primary">Stress less.</span>
                            </h1>
                            <p className="fs-5 text-secondary mt-3">
                                Book your appointment in just a few clicks. See all your appointments in one place on your dashboard.
                                Need another slot? Add a new appointment instantly, anytime.
                            </p>
                            <a href="#how" className="btn btn-outline-primary btn-lg mt-3">How it works</a>
                        </div>

                        <div id="get-started" className="col-lg-5 ms-lg-auto">
                            <div className="card card-hover fade-up shadow border-0">
                                <Suspense fallback={(
                                    <div role="status" className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
                                        <span className="flex items-center gap-2"><i className="bi bi-arrow-repeat animate-spin"></i> Loading sign-in...</span>
                                    </div>
                                )}>
                                    <Login />
                                </Suspense>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* STATS */}
            <section className="bg-white border-top border-bottom py-4">
                <div className="container">
                    <div className="row text-center">
                        {stats.map(s => (
                            <div className="col-sm-4" key={s.label}>
                                <div className="fs-2 fw-bold text-primary">{s.value}</div>
                                <div className="text-secondary small">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FEATURES */}
            <section id="features" className="py-5">
                <div className="container">
                    <h2 className="text-center fw-bold mb-4">Everything you need</h2>
                    <div className="row g-4">
                        {features.map(f => (
                            <div className="col-sm-6 col-lg-3" key={f.title}>
                                <div className="card card-hover fade-up h-100 shadow-sm border-0 p-3 text-center">
                                    <span className={`bi ${f.icon} fs-1 text-primary`}></span>
                                    <h5 className="mt-3">{f.title}</h5>
                                    <p className="text-secondary small mb-0">{f.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section id="how" className="bg-white py-5">
                <div className="container">
                    <h2 className="text-center fw-bold mb-4">How it works</h2>
                    <div className="row g-4 text-center">
                        {steps.map((s, i) => (
                            <div className="col-md-4 card-hover fade-up p-3 rounded" key={s.title}>
                                <div
                                    className="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center fs-4 fw-bold"
                                    style={{ width: 56, height: 56 }}>
                                    {i + 1}
                                </div>
                                <h5 className="mt-3">{s.title}</h5>
                                <p className="text-secondary small">{s.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="py-5">
                <div className="container">
                    <h2 className="text-center fw-bold mb-4">Frequently asked questions</h2>
                    <div className="mx-auto row g-3" style={{ maxWidth: 850 }}>
                        {[
                            ["How do I book an appointment?", "Create an account, sign in, and choose an available date and time from your dashboard."],
                            ["Can I change or cancel a booking?", "Yes. Open your appointment from the dashboard to edit or delete it."],
                            ["How will I know if it is confirmed?", "Your dashboard shows the latest appointment status after it has been reviewed."],
                        ].map(([question, answer]) => (
                            <div className="col-12" key={question}>
                                <article className="rounded border bg-white p-3">
                                    <h3 className="h6 fw-semibold mb-2">{question}</h3>
                                    <p className="text-secondary small mb-0">{answer}</p>
                                </article>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-black text-white-50 py-4 text-center small">
                © 2026 TaskEngine. All rights reserved.
            </footer>
        </div>
    );
}