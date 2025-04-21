# services/visa_service/Dockerfile

FROM python:3.9-slim
WORKDIR /app

# Install system packages for Tesseract, Pillow, AND mysqlclient
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # --- Tesseract + Pillow Dependencies ---
    tesseract-ocr \
    libtesseract-dev \
    # gcc \ # Already included below, no need to duplicate
    libjpeg-dev \
    zlib1g-dev \
    # --- Dependencies needed to build mysqlclient (and gcc for others) ---
    pkg-config \
    default-libmysqlclient-dev \
    gcc \ 
    # <<< ENSURE gcc IS PRESENT HERE
    # --- End dependencies ---
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5004 
# <<-- Change port

CMD ["waitress-serve", "--host=0.0.0.0", "--port=5004", "app:app"] # <<-- Change port