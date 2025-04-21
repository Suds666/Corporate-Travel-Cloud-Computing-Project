# services/auth_service/app.py
from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_cors import CORS
import os
import logging

app = Flask(__name__)
# Allow requests from anywhere for now (adjust in production if needed)
CORS(app)

# --- Logging ---
logging.basicConfig(level=logging.INFO)
app.logger.info("Starting Auth Service...")

# --- MySQL Config ---
# Make sure these environment variables are set (e.g., in Docker Compose or .env)
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'mysql_db')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'password')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'cc')
app.config['MYSQL_CURSORCLASS'] = 'DictCursor' # Important for accessing columns by name

try:
    mysql = MySQL(app)
    app.logger.info("Auth Service: MySQL connection configured.")
except Exception as e:
    app.logger.error(f"Auth Service: Failed to initialize MySQL: {e}")
    exit(1)


# === Login Endpoint ===
@app.route('/api/login', methods=['POST'])
def login():
    app.logger.info(f"Auth Service received request for {request.endpoint}")
    data = request.get_json()

    # --- Extract data from request ---
    company_name = data.get('companyName')
    email = data.get('email')
    name = data.get('name') # The name entered in the form
    # Although we receive the phone number, we won't use it for authentication here,
    # but we will retrieve the stored one from the DB if login is successful.
    # phone_number_from_request = data.get('phoneNumber') # We could get it if needed later

    app.logger.debug(f"Auth Service login attempt: Company='{company_name}', Email='{email}'")

    if not company_name or not email or not name: # Added check for name just in case
        app.logger.warning(f"Auth Service login failed: Missing company name, email, or name.")
        return jsonify({'status': 'error', 'message': 'Missing required login data'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()

        # --- MODIFIED QUERY: Added e.phone_number ---
        # IMPORTANT: Replace 'e.phone_number' if your column name is different!
        query = """
            SELECT
                e.id AS employee_id,
                e.name AS employee_name,
                e.email,
                e.department,
                e.role_id,
                e.phone_number,       -- <<< GET THE PHONE NUMBER FROM DB
                c.id AS company_id,
                c.name AS company_name,
                c.location,
                c.status
            FROM employees e
            JOIN companies c ON e.company_id = c.id
            WHERE e.email = %s AND c.name = %s
        """
        # Execute query using only email and company name for lookup
        cur.execute(query, (email, company_name))
        user = cur.fetchone() # Get the first matching user

        if user:
            # --- Login Successful ---
            app.logger.info(f"Auth Service login SUCCESS: Email='{email}', Company='{company_name}'")

            # --- Construct employee data, INCLUDING phone number ---
            employee_data = {
                "id": user['employee_id'],
                "name": user['employee_name'],          # Name from DB
                "email": user['email'],                 # Email from DB
                "department": user['department'],       # Department from DB
                "role_id": user['role_id'],             # Role ID from DB
                "phoneNumber": user['phone_number'],    # <<< PHONE NUMBER FROM DB (or None if NULL in DB)
                "company": {                            # Company details from DB
                    "id": user['company_id'],
                    "name": user['company_name'],
                    "location": user['location'],
                    "status": user['status']
                },
                "login_name": name # Pass the name entered during login through
                                   # Differentiate from user['employee_name'] which is from DB
            }

            # In a real app, you'd typically issue a JWT here.
            # For now, return success and the constructed employee data.
            return jsonify({'status': 'success', 'employee': employee_data}), 200
        else:
            # --- Login Failed ---
            app.logger.warning(f"Auth Service login FAILED: Invalid credentials for Email='{email}', Company='{company_name}'")
            return jsonify({'status': 'error', 'message': 'Invalid company or email'}), 401

    except Exception as e:
        # --- Database or other error ---
        app.logger.error(f"Auth Service DB error during login: {str(e)}", exc_info=True)
        # Avoid leaking detailed errors to the client in production
        return jsonify({'status': 'error', 'message': 'Internal server error during login'}), 500
    finally:
        # --- Ensure cursor is closed ---
        if cur:
            cur.close()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "auth"}), 200

# Note: Removed the __main__ block if running with Waitress/Gunicorn via Docker CMD/ENTRYPOINT
# if __name__ == '__main__':
#     app.run(debug=True, host='0.0.0.0', port=5001) # Port might differ based on your setup