import { useNavigate } from "react-router-dom";
import "./sidebar.css";

export default function Sidebar() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("is_Auth");
    navigate("/");
  }

  return (
    <aside className="sidebar">

      <h2 className="logo">Backoffice</h2>

      <nav className="menu">

        <button onClick={() => navigate("/bo/reset")}>
          Reset
        </button>

        <button onClick={() => navigate("/bo/import")}>
          Import
        </button>

        <button onClick={() => navigate("/bo/dashboard")}>
          Dashboard
        </button>

        <button onClick={() => navigate("/bo/jour-ferie")}>
          Jours f&eacute;ri&eacute;s
        </button>

        {/* <button onClick={() => navigate("/bo/salaries/job")}>
          Salaire par poste
        </button> */}

      </nav>

      <div className="footer">
        <button className="logout" onClick={logout}>
          Logout
        </button>
      </div>

    </aside>
  );
}