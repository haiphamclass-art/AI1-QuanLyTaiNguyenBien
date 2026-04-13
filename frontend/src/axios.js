import axios from 'axios';

// Function to get the token from storage (e.g., localStorage)
const getToken = () => {
  return localStorage.getItem('token'); // Adjust the key name based on your token storage
};
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://113.160.200.14/quanlytainguyen/';

// Create an Axios instance with default headers
const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
});

// Add a request interceptor to add the token to headers before each request
axiosInstance.interceptors.request.use(
  (config) => {
    const token = getToken(); // Retrieve the token from storage

    // If a token is available, attach it to the Authorization header
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosInstance;
