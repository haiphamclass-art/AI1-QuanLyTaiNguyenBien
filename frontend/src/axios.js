import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');

if (!apiBaseUrl) {
  throw new Error('Missing VITE_API_URL for the current frontend environment');
}

const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

export default axiosInstance;
