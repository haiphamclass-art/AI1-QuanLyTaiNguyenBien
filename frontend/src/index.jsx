import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import LoadingScreen from "./components/LoadingScreen";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { store } from "./redux/store";
import "./i18n";
const container = document.getElementById("root");
const root = createRoot(container);

const App = lazy(() => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(import("./App")), 2000);
  });
});

root.render(
  <Provider store={store}>
    <BrowserRouter basename="/quanlytainguyen">
      <Suspense fallback={<LoadingScreen />}>
        <App />
      </Suspense>
    </BrowserRouter>
  </Provider>
);
