import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { CookiesProvider } from "react-cookie";
import "./api";


import router from "./routes/routes.jsx";
import "./index.css";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-icons/font/bootstrap-icons.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
      <CookiesProvider>
        <RouterProvider router={router} />
      </CookiesProvider>
  </StrictMode>
);