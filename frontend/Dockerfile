# frontend/Dockerfile

# --- Stage 1: Build React App ---
# Use a Node.js image for building. 'alpine' is a lightweight version.
FROM node:18-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock if you use Yarn)
# Copying these first leverages Docker caching.
COPY package*.json ./
# If using Yarn:
# COPY yarn.lock ./
# COPY package.json ./

# Install dependencies using npm ci (clean install, generally preferred in CI/Docker)
RUN npm ci
# If using Yarn:
# RUN yarn install --frozen-lockfile

# Copy the rest of your frontend application code
COPY . .

# Build the React app for production. This creates the 'build' folder.
RUN npm run build
# If using Yarn:
# RUN yarn build

# --- Stage 2: Serve with Nginx ---
# Use an official Nginx image. 'alpine' is lightweight.
FROM nginx:stable-alpine

# Copy the production build output from the 'builder' stage (Stage 1)
# into Nginx's default directory for serving web content.
COPY --from=builder /app/build /usr/share/nginx/html

# Copy your custom Nginx configuration file (we'll create this next)
# This will overwrite the default Nginx config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Tell Docker that the container will listen on port 80 (Nginx default)
EXPOSE 80

# The default command for the Nginx image is to start the server.
# We don't need to specify it again, but it runs: nginx -g 'daemon off;'