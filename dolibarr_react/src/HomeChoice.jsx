import { useNavigate } from "react-router-dom";
import "./home.css";

export default function HomeChoice() {
  const navigate = useNavigate();

  return (
    <div className="home">

      <h1>Bienvenue</h1>

      <div className="cards">

        <div className="card" onClick={() => navigate("/bo/login")}>
          <h2>Backoffice</h2>
        </div>

        <div className="card" onClick={() => navigate("/fo/salaries/employes")}>
          <h2>Frontoffice</h2>
        </div>

      </div>

    </div>
  );
}