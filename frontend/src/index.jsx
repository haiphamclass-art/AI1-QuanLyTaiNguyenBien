import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import LoadingScreen from "./components/LoadingScreen";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { store, persistor } from "./redux/store";
import { PersistGate } from "redux-persist/integration/react";
import Loading from "./components/Loading";
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
    <PersistGate loading={<LoadingScreen />} persistor={persistor}>
      <BrowserRouter basename="/quanlytainguyen">
        <Suspense fallback={<LoadingScreen />}>
          <App />
        </Suspense>
      </BrowserRouter>
    </PersistGate>
  </Provider>
);
