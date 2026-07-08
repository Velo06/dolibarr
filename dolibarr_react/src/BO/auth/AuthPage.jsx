import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "./LoginPage.css";

export default function LoginPage() {

  const [password, setPassword] = useState("1234");

  const navigate = useNavigate();

  async function handleLogin(e) {

    e.preventDefault();

    try {

      if (password !== "1234") {

        alert("Code incorrect");
        return;
      }

      // login OK
      localStorage.setItem(
        "is_Auth",
        true
      );

      navigate("/bo/reset");

    } catch (error) {

      console.error(error);

      alert("Erreur connexion BO");
    }
  }

  return (
    <div className="login-container">

      <form
        onSubmit={handleLogin}
        className="login-box"
      >

        <h2>BackOffice Authentification</h2>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          required
        />

        <button type="submit">
          Entrer
        </button>

      </form>

    </div>
  );
}