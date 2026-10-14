import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // Tailwind — tanpa baris ini halaman tampil tanpa gaya
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
