import {
  Routes,
  Route,
} from "react-router-dom";

import HomeChoice from "../HomeChoice";

// BO
import LoginBO from "../BO/auth/AuthPage";
import BOLayout from "../layouts/BOLayout";
import ResetDataPage from "../BO/reset/ResetDataPage";
import DashboardPage from "../BO/dashboard/DashboardPage";
import ImportPage from "../BO/import/ImportPage";
import JourFeriePage from "../BO/back/JourFeriePage";

// FO
import FOLayout from "../layouts/FOLayout";
import EmployeeListPage from "../FO/salaries/EmployeeListPage";
import SalaryListPage from "../FO/salaries/SalaryListPage";
import SalaryCreatePayPage from "../FO/salaries/SalaryCreatePayPage";
import SalaryBulkPage from "../FO/salaries/SalaryBulkPage";
import EmployeeDetailPage from "../FO/salaries/EmployeeDetailPage";
import SalaryJob from "../BO/dashboard/SalaryJob";
import GenerationSalaire from "../FO/salaries/GenerationSalaire";
import GenerationPaiement from "../FO/salaries/GenerationPaiement";

export default function AppRouter() {

  return (

    <Routes>

      {/* HOME */}
      <Route
        path="/"
        element={<HomeChoice />}
      />

      {/* ================= BO ================= */}

      <Route
        path="/bo/login"
        element={<LoginBO />}
      />

      <Route
        path="/bo"
        element={<BOLayout />}
      >
        <Route
          path="reset"
          element={<ResetDataPage />}
        />

        <Route
          path="dashboard"
          element={<DashboardPage />}
        />

        <Route
          path="import"
          element={<ImportPage />}
        />

        <Route
          path="jour-ferie"
          element={<JourFeriePage />}
        />

        <Route
          path="salaries/job"
          element={<SalaryJob />}
        />

      </Route>

      {/* ================= FO ================= */}

      <Route
        path="/fo"
        element={<FOLayout />}
      >
        {/* Salariés : liste + recherche multi-critères */}
        <Route
          path="salaries/employes"
          element={<EmployeeListPage />}
        />

        {/* Salaires : liste de tous les salaires (tous statuts) */}
        <Route
          path="salaries/liste"
          element={<SalaryListPage />}
        />

        {/* Salaire : création (redirige ensuite vers la liste) */}
        <Route
          path="salaries/nouveau"
          element={<SalaryCreatePayPage />}
        />

        {/* Salaire multiple : génération en masse par filtre */}
        <Route
          path="salaries/multiple"
          element={<SalaryBulkPage />}
        />

        {/* Salaire : paiement d'un salaire existant (en plusieurs fois) */}
        <Route
          path="salaries/:id/payer"
          element={<SalaryCreatePayPage />}
        />

        <Route
          path="salaries/detail/:id"
          element={<EmployeeDetailPage />}
        />

        <Route
          path="salaries/vaovao"
          element={<GenerationSalaire />}
        />

        <Route
          path="paiement/vaovao"
          element={<GenerationPaiement />}
        />

      </Route>

    </Routes>
  );
}