# services/booking_service/app.py
from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_cors import CORS
import os
import logging
import requests # <-- Import requests library
import decimal # Import decimal

app = Flask(__name__)
CORS(app)

# --- Logging ---
logging.basicConfig(level=logging.INFO)
app.logger.info("Starting Booking Service...")

# --- MySQL Config ---
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'mysql_db')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'password')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'cc')
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

# --- Service URLs (from environment) ---
FLIGHT_SERVICE_URL = os.environ.get('FLIGHT_SERVICE_URL', 'http://flight-service:5002') # Default internal URL

try:
    mysql = MySQL(app)
    app.logger.info("Booking Service: MySQL connection configured.")
except Exception as e:
    app.logger.error(f"Booking Service: Failed to initialize MySQL: {e}")
    exit(1)

# === Finalize Booking Endpoint ===
@app.route('/api/finalize-booking', methods=['POST'])
def finalize_booking():
    data = request.get_json()
    app.logger.info(f"Booking Service received request for {request.endpoint}")
    app.logger.debug(f"Booking Service final booking data: {data}")

    required_fields = ['employee_id', 'flight_id', 'seat_number', 'origin', 'destination', 'airline']
    missing_fields = [field for field in required_fields if field not in data or data[field] is None]

    if missing_fields:
        app.logger.warning(f"Booking Service failed: Missing fields - {missing_fields}")
        return jsonify({'status': 'error', 'message': f'Missing booking data: {", ".join(missing_fields)}'}), 400

    cur = None
    try:
        flight_id = data['flight_id']
        seat_number = data['seat_number']
        employee_id = data['employee_id']
        origin = data['origin']
        destination = data['destination']
        airline = data['airline']

        # --- Step 1: Call Flight Service to get Price ---
        app.logger.info(f"Booking Service: Calling Flight Service for details of flight ID {flight_id}")
        price = None
        try:
            flight_details_url = f"{FLIGHT_SERVICE_URL}/api/internal/flights/{flight_id}/details"
            response = requests.get(flight_details_url, timeout=5) # Add a timeout

            if response.status_code == 200:
                flight_data = response.json()
                price = flight_data.get('price')
                # You could also verify origin/destination/airline match if needed
                app.logger.info(f"Booking Service: Received price {price} from Flight Service.")
                if price is None:
                     raise ValueError("Price not found in Flight Service response")
                # Convert price back to Decimal if needed for DB, or ensure DB accepts float/string
                price = decimal.Decimal(price)
            elif response.status_code == 404:
                app.logger.error(f"Booking Service: Flight Service reported flight ID {flight_id} not found.")
                return jsonify({'status': 'error', 'message': 'Flight details not found'}), 404
            else:
                app.logger.error(f"Booking Service: Error calling Flight Service. Status: {response.status_code}, Body: {response.text}")
                raise requests.exceptions.RequestException(f"Flight Service error: {response.status_code}")

        except requests.exceptions.Timeout:
             app.logger.error(f"Booking Service: Timeout calling Flight Service at {flight_details_url}")
             raise requests.exceptions.RequestException("Timeout contacting Flight Service")
        except requests.exceptions.ConnectionError:
             app.logger.error(f"Booking Service: Connection error calling Flight Service at {flight_details_url}")
             raise requests.exceptions.RequestException("Could not connect to Flight Service")
        except Exception as service_call_e: # Catch other potential errors like JSON parsing
            app.logger.error(f"Booking Service: Unexpected error during Flight Service call: {service_call_e}", exc_info=True)
            raise requests.exceptions.RequestException(f"Unexpected error fetching flight details: {service_call_e}")

        # --- Step 2: Check seat availability (within Booking Service's data) ---
        cur = mysql.connection.cursor()
        app.logger.debug(f"Booking Service: Checking seat availability for Flight {flight_id}, Seat {seat_number}")
        cur.execute("""
            SELECT id FROM bookings
            WHERE flight_id = %s AND seat_number = %s AND status = 'Confirmed'
        """, (flight_id, seat_number))
        existing_booking = cur.fetchone()
        if existing_booking:
            app.logger.warning(f"Booking Service: Seat {seat_number} on flight {flight_id} already booked.")
            return jsonify({'status': 'error', 'message': f'Seat {seat_number} is no longer available.'}), 409 # 409 Conflict

        # --- Step 3: Insert booking (into Booking Service's data) ---
        app.logger.debug(f"Booking Service: Inserting booking...")
        insert_query = """
            INSERT INTO bookings
            (employee_id, flight_id, booking_time, status, seat_number, origin, destination, airline, price)
            VALUES (%s, %s, NOW(), %s, %s, %s, %s, %s, %s)
        """
        booking_status = "Confirmed"
        values = (
            employee_id, flight_id, booking_status, seat_number,
            origin, destination, airline, price # Use price obtained from Flight Service
        )
        cur.execute(insert_query, values)
        mysql.connection.commit()

        app.logger.info("Booking Service: Booking successfully finalized.")
        return jsonify({'status': 'success', 'message': 'Booking confirmed successfully'}), 200

    except requests.exceptions.RequestException as req_err:
         # Error communicating with Flight Service
         if cur: cur.close() # Close cursor if open
         # mysql.connection.rollback() # No DB changes made yet usually
         return jsonify({'status': 'error', 'message': 'Failed to finalize booking due to internal communication error.', 'details': str(req_err)}), 503 # 503 Service Unavailable
    except Exception as e:
        if mysql.connection: # Rollback any potential DB changes if an error occurred after DB interaction started
             mysql.connection.rollback()
        app.logger.error(f"Booking Service: Final booking error: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to finalize booking due to an internal error.', 'details': str(e)}), 500
    finally:
        if cur:
            cur.close()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "booking"}), 200

# No __main__ block