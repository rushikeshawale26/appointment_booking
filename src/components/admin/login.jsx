import axios from "../../api"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useCookies } from "react-cookie"


export function AdminLogin() {

    const [errorMsg, setErrorMsg] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [, setCookie] = useCookies(['username', 'role']);

    const [user, setUser] = useState({
        user_id: "",
        password: ""
    })

    const navigate = useNavigate();

    function handleInputChange(e) {
        setUser({ ...user, [e.target.name]: e.target.value });
    }



    function handleSubmit(e) {
        e.preventDefault();
        setErrorMsg("");
        setSubmitting(true);
        axios.post("/admin-login", user)
            .then(({ data }) => {
                if (data.role === "admin") {
                    setCookie('username', data.username, { path: '/' });
                    setCookie('role', data.role, { path: '/' });
                    navigate('/admin-dashboard');
                }
                else {
                    setErrorMsg("Invalid User Id or Password");
                }
            })
            .catch((error) => setErrorMsg(
                error.response?.status === 401
                    ? "Invalid User Id or Password"
                    : error.response?.data?.error || "Could not reach the server. Check that the backend is running."
            ))
            .finally(() => setSubmitting(false));
    }


    return (
        <div className="container-fluid bg-light min-vh-100 d-flex justify-content-center align-items-center p-3">
            <div className="bg-white border rounded-4 shadow-sm p-4 w-100" style={{ maxWidth: '450px' }}>

                <h2 className="fw-bold mb-1">Admin login</h2>
                <p className="text-secondary small mb-4">Sign in to manage appointments.</p>

                <form onSubmit={handleSubmit}>
                    <dl>
                        <dt className="small mb-2">User Id</dt>
                        <dd className="mb-4"><input type="text" name="user_id" autoComplete="username" value={user.user_id} onChange={handleInputChange} className="form-control form-control-md" required /></dd>

                        <dt className="small mb-2">Password</dt>
                        <dd className="mb-3"><input type="password" name="password" autoComplete="current-password" value={user.password} onChange={handleInputChange} className="form-control form-control-md" required /></dd>

                        <dd className="small mb-0 text-danger" role="alert">{errorMsg}</dd>
                    </dl>

                    <button disabled={submitting} className="btn w-100 py-2 fw-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#00796b' }}>{submitting ? "Signing in..." : "Login"}</button>
                </form>

                <div className="text-center mt-4 small">
                    <Link to="/login" className="fw-semibold">User Login</Link>
                </div>

            </div>
        </div>
    )
}