import { memo, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

const links = [
    { href: "#home", id: "home", label: "Home", icon: "bi-house" },
    { href: "#features", id: "features", label: "Features", icon: "bi-stars" },
    { href: "#how", id: "how", label: "How it works", icon: "bi-diagram-3" },
    { href: "#faq", id: "faq", label: "FAQ", icon: "bi-question-circle" },
];

const NoLine = { textDecoration: "none" };

const NavLinks = memo(function NavLinks({ active, onClick, mobile }) {
    return links.map(l => {
        const isActive = active === l.id;
        return (
            <a
                key={l.id}
                href={l.href}
                onClick={onClick}
                aria-current={isActive ? "true" : undefined}
                style={NoLine}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium !no-underline hover:!no-underline transition-colors duration-200 ${
                    isActive ? "bg-teal-50 !text-teal-700" : "!text-slate-600 hover:bg-slate-100 hover:!text-teal-700"
                } ${mobile ? "w-full" : ""}`}
            >
                <span className={`bi ${l.icon}`}></span>
                {l.label}
            </a>
        );
    });
});

export function Home({ children }) {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [active, setActive] = useState("home");
    const close = useCallback(() => setOpen(false), []);

    // smooth anchor scrolling
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add("scroll-smooth");
        return () => root.classList.remove("scroll-smooth");
    }, []);

    // navbar shadow after scrolling
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // highlight the nav link of the section in view
    useEffect(() => {
        if (!("IntersectionObserver" in window)) return;
        const io = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) setActive(e.target.id);
                });
            },
            { rootMargin: "-40% 0px -55% 0px" }
        );
        links.forEach(l => {
            const el = document.getElementById(l.id);
            if (el) io.observe(el);
        });
        return () => io.disconnect();
    }, [children]);

    // close the mobile menu with Escape
    useEffect(() => {
        if (!open) return;
        const onKey = e => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <nav
                className={`sticky top-0 z-50 border-b bg-white/85 backdrop-blur transition-shadow duration-300 ${
                    scrolled ? "border-slate-200 shadow-md" : "border-transparent shadow-none"
                }`}
            >
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                    <Link
                        to="/"
                        style={NoLine}
                        className="group flex items-center gap-2 text-lg font-bold !text-teal-700 !no-underline hover:!no-underline"
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
                            <span className="bi bi-calendar-check"></span>
                        </span>
                        BookEase
                    </Link>

                    <div className="hidden items-center gap-1 md:flex">
                        <NavLinks active={active} />
                    </div>

                    <div className="flex items-center gap-2">
                        <a
                            href="#get-started"
                            style={NoLine}
                            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold !text-white !no-underline hover:!no-underline shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-md active:translate-y-0 active:scale-95"
                        >
                            Get Started <span className="bi bi-arrow-right"></span>
                        </a>
                        <button
                            type="button"
                            aria-label="Toggle menu"
                            aria-expanded={open}
                            aria-controls="mainNav"
                            onClick={() => setOpen(o => !o)}
                            className="rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 md:hidden"
                        >
                            <span className={`bi ${open ? "bi-x-lg" : "bi-list"} text-xl`}></span>
                        </button>
                    </div>
                </div>

                {/* mobile menu */}
                <div
                    id="mainNav"
                    className={`grid transition-all duration-300 ease-out md:hidden ${
                        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                >
                    <div className="overflow-hidden">
                        <div className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3">
                            <NavLinks active={active} onClick={close} mobile />
                        </div>
                    </div>
                </div>
            </nav>

            <main>{children}</main>
        </div>
    );
}