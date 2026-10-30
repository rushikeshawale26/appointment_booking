import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import axios from "../api"
import { useCookies } from "react-cookie"



export function Login() {

    const [errorMsg, setErrorMsg] = useState("");
    const [, setCookie] = useCookies(['username', 'role']);
    const navigate = useNavigate();



    const [user, setUser] = useState({
        username: "",
        password: ""
    })

    function handleInput(e) {
        setUser({ ...user, [e.target.name]: e.target.value })
    }



    function handleSubmit(e) {
        e.preventDefault();
        setErrorMsg("");

        axios.post('/login', user)
            .then(({ data }) => {
                setCookie('username', data.username, { path: '/' });
                setCookie('role', data.role, { path: '/' });
                navigate(data.role === 'receptionist' ? '/admin-dashboard' : '/dashboard');
            })
            .catch(() => setErrorMsg("Invalid Username or Password"));
    }


    return (
        <div className="w-full px-4 py-6">
            <form className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={handleSubmit}>
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
                    <p className="text-sm text-slate-600">Sign in to continue to your account.</p>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="login-username" className="block text-sm font-medium text-slate-700">Username</label>
                        <input id="login-username" type="text" name="username" autoComplete="username" required value={user.username} onChange={handleInput} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
                        <input id="login-password" type="password" name="password" autoComplete="current-password" required value={user.password} onChange={handleInput} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
                    </div>
                </div>
                {errorMsg && <p role="alert" className="text-sm text-red-600">{errorMsg}</p>}
                <div className="space-y-4">
                    <button className="w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2">Login</button>
                    <p className="text-center text-sm text-slate-600 mt-3">
                        New here? <Link to="/register" className="font-semibold text-teal-700 underline-offset-4 hover:underline">Create an account</Link><br />
                        <Link to='/admin' className="font-semibold text-teal-700 underline-offset-4 hover:underline">Admin Login</Link>
                    </p>
                </div>
            </form>
        </div>
    )
}