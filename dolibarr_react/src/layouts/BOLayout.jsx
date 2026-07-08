import { Navigate, Outlet } from "react-router-dom";
import Sidebar from "../BO/components/Sidebar";
import "./layout.css";

export default function BOLayout() {

  const token = localStorage.getItem("is_Auth");

  if (!token) return <Navigate to="/bo/login" />;

  return (
    <div className="layout">
      <Sidebar />
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
