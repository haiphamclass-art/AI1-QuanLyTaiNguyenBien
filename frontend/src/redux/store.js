import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2';
import authReducer from './authSlice';

const persistConfig = {
  key: 'auth',
  storage: storage,
  stateReconciler: autoMergeLevel2,
};

const pAuthReducer = persistReducer(persistConfig, authReducer);

export const store = configureStore({
  reducer: {
    auth: pAuthReducer,
  },
});

export const persistor = persistStore(store);
