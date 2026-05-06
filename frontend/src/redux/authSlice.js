import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import axios from '../axios';

const applyAuthenticatedState = (state, user) => {
  state.user = user;
  state.role = user?.role || null;
  state.isAuthenticated = Boolean(user);
  state.isInitialized = true;
  state.error = null;
};

const clearState = (state) => {
  state.user = null;
  state.role = null;
  state.isAuthenticated = false;
  state.isInitialized = true;
  state.error = null;
};

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/api/express/auth/me');
      return response.data.user;
    } catch (error) {
      return rejectWithValue(error.response?.data || { error: 'Unable to restore session' });
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axios.post('/api/express/auth/login', credentials);
      return response.data.user;
    } catch (error) {
      return rejectWithValue(error.response?.data || { error: 'Login failed' });
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      await axios.post('/api/express/auth/logout');
      return true;
    } catch (error) {
      return rejectWithValue(error.response?.data || { error: 'Logout failed' });
    }
  }
);

const initialState = {
  user: null,
  role: null,
  isAuthenticated: false,
  isInitialized: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthState: (state) => {
      clearState(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        applyAuthenticatedState(state, action.payload);
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        clearState(state);
        state.error = action.payload?.error || null;
      })
      .addCase(loginUser.pending, (state) => {
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        applyAuthenticatedState(state, action.payload);
      })
      .addCase(loginUser.rejected, (state, action) => {
        clearState(state);
        state.error = action.payload?.error || null;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        clearState(state);
      })
      .addCase(logoutUser.rejected, (state) => {
        clearState(state);
      });
  },
});

export const { clearAuthState } = authSlice.actions;

export default authSlice.reducer;
