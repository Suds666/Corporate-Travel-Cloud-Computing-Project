# services/flight_service/app.py
from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_cors import CORS
import os
import logging
import decimal # Import decimal for handling price correctly
import datetime # <<<--- IMPORT datetime

app = Flask(__name__)
CORS(app)

# --- Logging ---
logging.basicConfig(level=logging.INFO)
app.logger.info("Starting Flight Service...")

# --- MySQL Config ---
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'mysql_db')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'password')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'cc')
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

try:
    mysql = MySQL(app)
    app.logger.info("Flight Service: MySQL connection configured.")
except Exception as e:
    app.logger.error(f"Flight Service: Failed to initialize MySQL: {e}")
    exit(1)

# === Get Flights Endpoint (for Frontend) ===
@app.route('/api/flights', methods=['GET'])
def get_flights():
    company_id = request.args.get('company_id')
    app.logger.info(f"Flight Service received request for {request.endpoint} with company_id: {company_id}")

    if not company_id:
        app.logger.warning(f"{request.endpoint}: company_id is required")
        return jsonify({'error': 'company_id is required'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        # Query focuses on the 'flights' table
        cur.execute("SELECT * FROM flights WHERE company_id = %s", (company_id,))
        flights = cur.fetchall() # This fetches rows as dictionaries

        # --- Process the fetched data for JSON compatibility ---
        processed_flights = []
        for flight_row in flights:
            processed_flight = dict(flight_row) # Create a mutable copy

            # Convert Decimal to float/string
            if isinstance(processed_flight.get('price'), decimal.Decimal):
                processed_flight['price'] = float(processed_flight['price'])

            # *** NEW: Convert datetime.time to string "HH:MM:SS" ***
            if isinstance(processed_flight.get('departure_time'), datetime.time):
                processed_flight['departure_time'] = processed_flight['departure_time'].strftime('%H:%M:%S')
            elif processed_flight.get('departure_time') is not None: # Handle if it's already a string somehow
                 processed_flight['departure_time'] = str(processed_flight['departure_time'])


            if isinstance(processed_flight.get('arrival_time'), datetime.time):
                processed_flight['arrival_time'] = processed_flight['arrival_time'].strftime('%H:%M:%S')
            elif processed_flight.get('arrival_time') is not None: # Handle if it's already a string
                 processed_flight['arrival_time'] = str(processed_flight['arrival_time'])

            # Convert any other necessary types here (e.g., dates if you had separate date columns)

            processed_flights.append(processed_flight)
        # --- End Processing ---

        app.logger.info(f"Found and processed {len(processed_flights)} flights for company_id {company_id}")
        return jsonify(processed_flights), 200 # Return the processed list

    except Exception as e:
        app.logger.error(f"Flight Service error processing/fetching flights: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error processing flight data'}), 500
    finally:
        if cur:
            cur.close()


# === Get Flight Details Endpoint (for INTERNAL Service-to-Service communication) ===
# IMPORTANT: Also apply the time conversion fix here if this endpoint is used
@app.route('/api/internal/flights/<int:flight_id>/details', methods=['GET'])
def get_flight_details_internal(flight_id):
    app.logger.info(f"Flight Service received internal request for flight details: ID={flight_id}")
    cur = None
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT price, origin, destination, airline, departure_time, arrival_time FROM flights WHERE id = %s", (flight_id,)) # Fetch times too
        flight_details_row = cur.fetchone()

        if not flight_details_row:
             app.logger.warning(f"Internal request: Flight not found with ID={flight_id}")
             return jsonify({'error': 'Flight not found'}), 404

        processed_details = dict(flight_details_row) # Mutable copy

        # Convert Decimal
        if isinstance(processed_details.get('price'), decimal.Decimal):
             processed_details['price'] = float(processed_details['price'])

        # *** NEW: Convert datetime.time to string "HH:MM:SS" ***
        if isinstance(processed_details.get('departure_time'), datetime.time):
            processed_details['departure_time'] = processed_details['departure_time'].strftime('%H:%M:%S')
        elif processed_details.get('departure_time') is not None:
             processed_details['departure_time'] = str(processed_details['departure_time'])

        if isinstance(processed_details.get('arrival_time'), datetime.time):
            processed_details['arrival_time'] = processed_details['arrival_time'].strftime('%H:%M:%S')
        elif processed_details.get('arrival_time') is not None:
             processed_details['arrival_time'] = str(processed_details['arrival_time'])

        app.logger.info(f"Internal request: Found and processed details for flight ID={flight_id}")
        return jsonify(processed_details), 200 # Return processed dict
    except Exception as e:
        app.logger.error(f"Flight Service DB error fetching internal details for ID={flight_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Internal server error processing flight details'}), 500
    finally:
        if cur:
            cur.close()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "flight"}), 200

# No __main__ block needed