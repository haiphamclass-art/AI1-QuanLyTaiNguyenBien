# Use Node.js 23 as the base image
FROM node:23

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the entire backend app
COPY . .

# Expose the backend port (default: 5000)
EXPOSE 5000

# Start the backend server
CMD ["node", "app.js"]
