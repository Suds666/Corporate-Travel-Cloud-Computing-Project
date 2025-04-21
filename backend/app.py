# backend/app.py (MODIFIED FOR DOCKER)

from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_cors import CORS
import pytesseract
from PIL import Image
import os
import datetime
import decimal
import logging

app = Flask(__name__)
CORS(app) # Enable Cross-Origin Requests

# --- Logging Configuration ---
# Basic logging is fine for now
logging.basicConfig(level=logging.INFO) # Log INFO level messages and above

# --- MySQL Configuration (Read from Environment Variables) ---
# These values will be provided by docker-compose.yml
# Default values ('localhost', 'root', etc.) are fallback for running outside Docker (less recommended)
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'localhost')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'fallback_password_if_not_set') # Get password from environment
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'cc')
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

try:
    mysql = MySQL(app)
    app.logger.info("MySQL configured.")
except Exception as e:
    app.logger.error(f"Failed to initialize MySQL: {e}")
    # You might want to exit or handle this more gracefully if the DB connection is critical at startup

# --- Upload Folder Configuration (Path inside the Container) ---
UPLOAD_FOLDER = '/app/visa_uploads' # Absolute path INSIDE the Docker container
# This path '/app/visa_uploads' will be linked to './backend/visa_uploads' on your computer by docker-compose
os.makedirs(UPLOAD_FOLDER, exist_ok=True) # Create the directory if it doesn't exist inside the container
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.logger.info(f"Upload folder set to: {UPLOAD_FOLDER}")

# === Your API Routes (Keep them exactly as they were) ===

@app.route('/api/login', methods=['POST'])
def login():
    app.logger.info(f"Received request for {request.endpoint}")
    data = request.get_json()
    company_name = data.get('companyName')
    email = data.get('email')
    name = data.get('name')

    app.logger.debug(f"Login attempt data: Company='{company_name}', Email='{email}', Name='{name}'")

    if not company_name or not email:
        app.logger.warning(f"Login failed: Missing company name or email in request.")
        return jsonify({'status': 'error', 'message': 'Missing data'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        query = """
            SELECT e.id AS employee_id, e.name AS employee_name, e.email, e.department, e.role_id,
                   c.id AS company_id, c.name AS company_name, c.location, c.status
            FROM employees e
            JOIN companies c ON e.company_id = c.id
            WHERE e.email = %s AND c.name = %s
        """
        cur.execute(query, (email, company_name))
        user = cur.fetchone()

        if user:
            app.logger.info(f"Login successful for Email='{email}', Company='{company_name}' (Status: {user['status']})")
            employee_data = {
                "id": user['employee_id'],
                "name": user['employee_name'],
                "email": user['email'],
                "department": user['department'],
                "role_id": user['role_id'],
                "company": {
                    "id": user['company_id'],
                    "name": user['company_name'],
                    "location": user['location'],
                    "status": user['status']
                },
                "login_name": name
            }
            return jsonify({'status': 'success', 'employee': employee_data}), 200
        else:
            app.logger.warning(f"Login failed: Invalid credentials for Email='{email}', Company='{company_name}'")
            return jsonify({'status': 'error', 'message': 'Invalid company or email'}), 401
    except Exception as e:
        app.logger.error(f"Database error during login for Email='{email}': {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Database error during login'}), 500
    finally:
         if cur:
            cur.close()

@app.route('/api/flights', methods=['GET'])
def get_flights():
    company_id = request.args.get('company_id')
    app.logger.info(f"Received request for {request.endpoint} with company_id: {company_id}")

    if not company_id:
        app.logger.warning(f"{request.endpoint}: company_id is required")
        return jsonify({'error': 'company_id is required'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM flights WHERE company_id = %s", (company_id,))
        flights = cur.fetchall()
        app.logger.info(f"Found {len(flights)} flights for company_id {company_id}")
        return jsonify(flights), 200
    except Exception as e:
        app.logger.error(f"Database error fetching flights for company_id {company_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Database error fetching flights', 'details': str(e)}), 500
    finally:
         if cur:
            cur.close()

@app.route('/api/finalize-booking', methods=['POST'])
def finalize_booking():
    data = request.get_json()
    app.logger.info(f"Received request for {request.endpoint}")
    app.logger.debug(f"Final booking data: {data}")

    required_fields = ['employee_id', 'flight_id', 'seat_number', 'origin', 'destination', 'airline']
    missing_fields = [field for field in required_fields if field not in data or data[field] is None]

    if missing_fields:
        app.logger.warning(f"Final booking failed: Missing fields - {missing_fields}")
        return jsonify({'status': 'error', 'message': f'Missing booking data: {", ".join(missing_fields)}'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        flight_id = data['flight_id']

        # 1. Fetch price
        app.logger.debug(f"Fetching price for flight_id = {flight_id}")
        cur.execute("SELECT price FROM flights WHERE id = %s", (flight_id,))
        flight_result = cur.fetchone()

        if not flight_result:
            app.logger.error(f"Flight not found with id = {flight_id}")
            return jsonify({'status': 'error', 'message': 'Flight details not found'}), 404
        price = flight_result['price']
        app.logger.debug(f"Price found: {price}")

        # 2. Check seat availability (optional but good)
        cur.execute("""
            SELECT id FROM bookings
            WHERE flight_id = %s AND seat_number = %s AND status = 'Confirmed'
        """, (flight_id, data['seat_number']))
        existing_booking = cur.fetchone()
        if existing_booking:
            app.logger.warning(f"Seat {data['seat_number']} on flight {flight_id} is already booked.")
            return jsonify({'status': 'error', 'message': f'Seat {data["seat_number"]} is no longer available.'}), 409

        # 3. Insert booking
        insert_query = """
            INSERT INTO bookings
            (employee_id, flight_id, booking_time, status, seat_number, origin, destination, airline, price)
            VALUES (%s, %s, NOW(), %s, %s, %s, %s, %s, %s)
        """
        booking_status = "Confirmed"
        values = (
            data['employee_id'], flight_id, booking_status, data['seat_number'],
            data['origin'], data['destination'], data['airline'], price
        )
        app.logger.debug(f"Inserting booking with values: {values}")
        cur.execute(insert_query, values)
        mysql.connection.commit()

        app.logger.info("Booking successfully finalized and saved.")
        return jsonify({'status': 'success', 'message': 'Booking confirmed successfully'}), 200

    except Exception as e:
        mysql.connection.rollback()
        app.logger.error(f"Final booking error: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to finalize booking', 'details': str(e)}), 500
    finally:
        if cur:
             cur.close()

@app.route('/api/verify-visa', methods=['POST'])
def verify_visa():
    app.logger.info(f"Received request for {request.endpoint}")
    name = request.form.get('name')
    email = request.form.get('email')
    company = request.form.get('company')
    file = request.files.get('visa')

    app.logger.debug(f"Visa verification attempt: Name='{name}', Email='{email}', Company='{company}', File={file.filename if file else 'None'}")

    if not all([name, email, company, file]):
        app.logger.warning("Visa verification failed: Missing form data.")
        return jsonify({'status': 'error', 'message': 'Missing visa upload data'}), 400

    # Consider sanitizing filename in production!
    filename = file.filename # Simple filename for now
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    try:
        file.save(filepath)
        app.logger.info(f"Visa file saved to: {filepath}")
    except Exception as e:
        app.logger.error(f"Error saving uploaded visa file {filename}: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to save uploaded file'}), 500

    try:
        app.logger.debug(f"Starting OCR processing for file: {filepath}")
        # Ensure pytesseract can find the executable if needed (might be okay in Docker PATH)
        # pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract' # Example if needed
        text = pytesseract.image_to_string(Image.open(filepath))
        app.logger.debug("OCR processing completed.")

        # Log first few characters of OCR output for debugging
        app.logger.debug(f"OCR Output (first 300 chars): {text[:300]}{'...' if len(text) > 300 else ''}")

        name_lower = name.lower()
        email_lower = email.lower()
        company_lower = company.lower()
        text_lower = text.lower()

        name_match = name_lower in text_lower
        email_match = email_lower in text_lower
        company_match = company_lower in text_lower

        app.logger.debug(f"Verification Checks: Name Match: {name_match}, Email Match: {email_match}, Company Match: {company_match}")

        if name_match and email_match and company_match:
            app.logger.info(f"Visa verification SUCCESS for Name='{name}', Email='{email}', Company='{company}'")
            # Optional: Remove file after success?
            # os.remove(filepath)
            return jsonify({'status': 'success', 'message': '✅ Visa verified successfully'}), 200
        else:
            app.logger.warning(f"Visa verification FAILED (Mismatch) for Name='{name}', Email='{email}', Company='{company}'")
            # Optional: Remove file after failure?
            # os.remove(filepath)
            return jsonify({'status': 'error', 'message': '❌ Visa details do not match'}), 403 # Use 403 Forbidden for mismatch

    except pytesseract.TesseractNotFoundError:
         app.logger.error("Tesseract executable not found. Ensure it's installed and in the system's PATH within the container.")
         return jsonify({'status': 'error', 'message': 'OCR engine not configured correctly on server'}), 500
    except Exception as e:
        app.logger.error(f"Error during OCR or verification process for {filepath}: {str(e)}", exc_info=True)
        # Optional: Remove file after error?
        # if os.path.exists(filepath): os.remove(filepath)
        return jsonify({'status': 'error', 'message': 'OCR processing failed', 'details': str(e)}), 500
    # Removed finally block for file removal, manage explicitly if needed


@app.route('/api/booking-analytics', methods=['GET'])
def booking_analytics():
    company_id = request.args.get('company_id')
    app.logger.info(f"Received request for {request.endpoint} with company_id: {company_id}")

    if not company_id:
         app.logger.warning("Analytics request missing company_id.")
         return jsonify({'status': 'error', 'message': 'company_id is required'}), 400

    try:
        company_id_int = int(company_id)
    except ValueError:
        app.logger.warning(f"Analytics request received invalid non-integer company_id: {company_id}")
        return jsonify({'status': 'error', 'message': 'Invalid company_id format'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        app.logger.debug(f"Analytics: Cursor created for company_id {company_id_int}.")

        # 1. Bookings per airline
        app.logger.debug(f"Analytics: Fetching bookings per airline for company_id {company_id_int}...")
        cur.execute("""
            SELECT b.airline, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s GROUP BY b.airline ORDER BY total DESC
        """, (company_id_int,))
        bookings_per_airline = cur.fetchall()
        app.logger.debug(f"Analytics: Found {len(bookings_per_airline)} airlines.")

        # 2. Bookings over time
        app.logger.debug(f"Analytics: Fetching bookings over time (last 30 days) for company_id {company_id_int}...")
        cur.execute("""
            SELECT DATE(b.booking_time) AS date, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s AND b.booking_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(b.booking_time) ORDER BY date ASC
        """, (company_id_int,))
        bookings_over_time = cur.fetchall()
        app.logger.debug(f"Analytics: Found {len(bookings_over_time)} days with bookings.")
        # Convert date objects to strings
        for item in bookings_over_time:
             if isinstance(item.get('date'), (datetime.date, datetime.datetime)):
                 item['date'] = item['date'].isoformat()

        # 3. Top 5 destinations
        app.logger.debug(f"Analytics: Fetching top destinations for company_id {company_id_int}...")
        cur.execute("""
            SELECT b.destination, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s GROUP BY b.destination ORDER BY total DESC LIMIT 5
        """, (company_id_int,))
        top_destinations = cur.fetchall()
        app.logger.debug(f"Analytics: Found {len(top_destinations)} top destinations.")

        app.logger.info(f"Analytics: Data fetched successfully for company_id {company_id_int}.")
        return jsonify({
            'bookings_per_airline': bookings_per_airline,
            'bookings_over_time': bookings_over_time,
            'top_destinations': top_destinations
        }), 200

    except Exception as e:
        app.logger.error(f"Analytics error for company_id {company_id_int}: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to fetch analytics', 'details': str(e)}), 500
    finally:
        if cur:
            cur.close()
            app.logger.debug(f"Analytics: Cursor closed for company_id {company_id_int}.")


# --- IMPORTANT: Remove or comment out the __main__ block ---
# Docker will run the app using the CMD in the Dockerfile (using Waitress)
# This block is mainly for running `python app.py` directly for local testing *without* Docker/Waitress
# if __name__ == '__main__':
#    # When running with Waitress via Docker CMD, this block is NOT executed.
#    print("RUNNING FLASK DEVELOPMENT SERVER (Not for production/Docker Waitress setup)")
#    # Use debug=False and host='0.0.0.0' if you absolutely need to test this way,
#    # but it's better to test using waitress-serve locally too for consistency.
#    app.run(debug=False, host='0.0.0.0', port=5000)