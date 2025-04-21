# api_gateway/Dockerfile
FROM nginx:stable-alpine

# Remove default config first
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY nginx.conf /etc/nginx/conf.d/api_gateway.conf

# Expose the port Nginx is listening on inside the container
EXPOSE 8080

# Default Nginx command starts the server