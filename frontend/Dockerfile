# Step 1: Build the frontend (example for a Node.js/React app)
FROM node:23 AS build

WORKDIR /app

ARG VITE_BUILD_MODE=production

# Copy package.json and package-lock.json (or yarn.lock if using yarn)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the source code
COPY . .

# Build the app
RUN npm run build -- --mode ${VITE_BUILD_MODE} && ls -R /app


# Step 2: Serve the app using Nginx
FROM nginx:latest

# Copy the build folder from the previous stage to the Nginx HTML directory
COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx-internal.conf /etc/nginx/conf.d/default.conf
# Expose port 80 (default for Nginx)
EXPOSE 80

# Use the default Nginx configuration (or replace with custom config if necessary)
CMD ["nginx", "-g", "daemon off;"]
