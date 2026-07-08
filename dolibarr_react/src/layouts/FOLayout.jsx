import { Outlet } from "react-router-dom";

import FOSidebar from "../FO/components/FOSidebar";
import "./layout.css";

export default function FOLayout() {

  return (

    <div className="layout">

      <FOSidebar />

      <main className="layout-main">
        <Outlet />
      </main>

    </div>
  );
}
