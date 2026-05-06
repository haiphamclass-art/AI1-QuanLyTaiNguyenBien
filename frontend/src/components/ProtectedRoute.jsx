import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import LoadingScreen from './LoadingScreen';

const SUPPRESS_SPLASH_KEY = 'suppress_loading_screen_once';

const ProtectedRoute = ({ children, roles }) => {
  const { role, isAuthenticated, isInitialized } = useSelector((state) => state.auth);
  const suppressLoadingScreen = sessionStorage.getItem(SUPPRESS_SPLASH_KEY) === '1';

  if (!isInitialized && !suppressLoadingScreen) {
    return <LoadingScreen />;
  }

  if (!isInitialized && suppressLoadingScreen) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
