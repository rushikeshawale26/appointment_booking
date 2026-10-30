import { createBrowserRouter } from "react-router-dom"
import App from "../App"
import { RoutePage } from "../components/route-page"

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        children : [

            {
                index:true,
                element: <RoutePage page="section" />
            },
            {
                path: 'login',
                element: <RoutePage page="login" />
            },

            {
                path:'register',
                element: <RoutePage page="register" />
            },

        ]
    },

    // user 
    {
        path:'/dashboard',
        element:<RoutePage page="dashboard" />
    },

    // admin
    {
        path:'/admin',
        element:<RoutePage page="adminLogin" />
    },
    
    {
        path:'/admin-dashboard',
        element: <RoutePage page="adminDashboard" />
        
    },
    {
        path: '/contact-view/:token',
        element: <RoutePage page="contactView" />
    },
    {
        path: '/profile',
        element: <RoutePage page="profile" />
    },
   
])

export default router