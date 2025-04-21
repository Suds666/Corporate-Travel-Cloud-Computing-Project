# backend/Dockerfile

# Use an official Python slim image (smaller base)
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Install system packages needed by your Python libraries
# tesseract-ocr: The OCR engine
# libtesseract-dev: Development files for tesseract (might be needed by pytesseract)
# gcc: C compiler (sometimes needed for building Python packages)
# libjpeg-dev, zlib1g-dev: Common libraries for image processing (Pillow)
# --no-install-recommends: Don't install optional packages to save space
# Clean up apt cache afterwards to reduce image size
# backend/Dockerfile (MODIFIED LINE)

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Dependencies for Tesseract and Pillow
    tesseract-ocr \
    libtesseract-dev \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    # --- ADDED dependencies needed to build mysqlclient ---
    pkg-config \
    default-libmysqlclient-dev \
    # --- End ADDED dependencies ---
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first
# This takes advantage of Docker caching - if requirements.txt doesn't change,
# pip install won't run again on rebuilds, making builds faster.
COPY requirements.txt .

# Install Python dependencies from requirements.txt
# --no-cache-dir: Don't store the pip cache, saving space
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your backend application code into the container's /app directory
COPY . .

# Tell Docker that the container will listen on port 5000
EXPOSE 5000

# The command to run when the container starts
# Use Waitress (production-ready server) to serve your Flask app (app:app means instance 'app' in file 'app.py')
# --host=0.0.0.0: Makes the server accessible from outside the container (within the Docker network)
CMD ["waitress-serve", "--host=0.0.0.0", "--port=5000", "app:app"]