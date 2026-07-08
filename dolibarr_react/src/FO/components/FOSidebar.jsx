import { useNavigate } from "react-router-dom";
import "./foSidebar.css";

export default function FOSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="fo-sidebar">

      <h2 className="logo">Frontoffice</h2>

      <nav className="menu">

        <button onClick={() => navigate("/fo/salaries/employes")}>
          Salariés
        </button>

        <button onClick={() => navigate("/fo/salaries/liste")}>
          Salaires
        </button>

        <button onClick={() => navigate("/fo/salaries/nouveau")}>
          Nouveau salaire
        </button>

        <button onClick={() => navigate("/fo/salaries/multiple")}>
          Salaire multiple
        </button>

        <button onClick={() => navigate("/fo/salaries/vaovao")}>
          G&eacute;n&eacute;ration salaire
        </button>

        <button onClick={() => navigate("/fo/paiement/vaovao")}>
          G&eacute;n&eacute;ration paiement
        </button>

      </nav>

      <div className="footer">
        <button className="logout" onClick={() => navigate("/")}>
          Accueil
        </button>
      </div>

    </aside>
  );
}