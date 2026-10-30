import axios from "../api";
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
export function Register(){

    const [Msg, setUserMsg] = useState("");
    const navigate = useNavigate();
    const [errorClass, setErrorClass] = useState("");
    const [user, setUser] = useState({
        username:"",
        email:"",
        password:""
    })
    function handleInput(e){
        setUser({...user, [e.target.name]:e.target.value});
    }

    function handleUsername(e){
                const username = e.target.value.trim();
                if (!username) return;
                axios.get("/check-username", { params: { username } })
                .then(({ data }) => {
                        if(!data.available){
              setUserMsg("Username Already Taken - Try Another");
              setErrorClass("text-danger");
            }else{
                setUserMsg("Username Available");
                setErrorClass("text-success");
            }
        })
    }


    function handleSubmit(e){
     e.preventDefault();
    axios.post("/register-user", user)
    .then(() => {
        alert('Register Success');
        navigate('/login')
      })
            .catch(error => {
                setUserMsg(error.response?.data?.error || "Registration failed");
                setErrorClass("text-danger");
            })
    }



    return(
        <div className="w-full px-4 py-6">
            <form className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={handleSubmit}>
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold text-slate-900">Create your account</h2>
                    <p className="text-sm text-slate-600">Register to get started.</p>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="register-username" className="block text-sm font-medium text-slate-700">Username</label>
                        <input id="register-username" type="text" name="username" autoComplete="username" required onBlur={handleUsername} onChange={handleInput} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
                        {Msg && <p aria-live="polite" className={`text-sm ${errorClass === "text-danger" ? "text-red-600" : "text-emerald-700"}`}>{Msg}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="register-email" className="block text-sm font-medium text-slate-700">Email</label>
                        <input id="register-email" type="email" name="email" autoComplete="email" required onChange={handleInput} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="register-password" className="block text-sm font-medium text-slate-700">Password</label>
                        <input id="register-password" type="password" name="password" autoComplete="new-password" minLength={8} required onChange={handleInput} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
                    </div>
                </div>
                <div className="space-y-4">
                    <button className="w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2">Register</button>
                    <p className="text-center text-sm text-slate-600">
                        Already registered? <Link to="/login" className="font-semibold text-teal-700 underline-offset-4 hover:underline">Sign in</Link>
                    </p>
                </div>
            </form>
        </div>
    )
}