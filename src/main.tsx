import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import App from "./App";
import { AppMantineThemeProvider } from "./components/ui/MantineThemeProvider";
import { initLogging } from "./lib/logger";

void initLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppMantineThemeProvider>
      <App />
    </AppMantineThemeProvider>
  </React.StrictMode>,
);
