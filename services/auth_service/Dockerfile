# services/auth_service/Dockerfile

FROM python:3.9-slim
WORKDIR /app

# Install only system packages needed for mysqlclient
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # --- Dependencies needed to build mysqlclient ---
    pkg-config \
    default-libmysqlclient-dev \
    gcc \ 
    # <<< ADD THIS LINE BACK
    # --- End dependencies ---
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001 
# Use a unique internal port for this service

# Command to run Waitress
CMD ["waitress-serve", "--host=0.0.0.0", "--port=5001", "app:app"]