# services/analytics_service/app.py
from flask import Flask, request, jsonify
from flask_mysqldb import MySQL
from flask_cors import CORS
import os
import logging
import datetime
import decimal # Import decimal

app = Flask(__name__)
CORS(app)

# --- Logging ---
logging.basicConfig(level=logging.INFO)
app.logger.info("Starting Analytics Service...")

# --- MySQL Config ---
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'mysql_db')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'password')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'cc')
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

try:
    mysql = MySQL(app)
    app.logger.info("Analytics Service: MySQL connection configured.")
except Exception as e:
    app.logger.error(f"Analytics Service: Failed to initialize MySQL: {e}")
    exit(1)

# === Booking Analytics Endpoint ===
@app.route('/api/booking-analytics', methods=['GET'])
def booking_analytics():
    company_id = request.args.get('company_id')
    app.logger.info(f"Analytics Service received request for {request.endpoint} with company_id: {company_id}")

    if not company_id:
        app.logger.warning("Analytics request missing company_id.")
        return jsonify({'status': 'error', 'message': 'company_id is required'}), 400

    try:
        company_id_int = int(company_id)
    except ValueError:
        app.logger.warning(f"Analytics request received invalid company_id: {company_id}")
        return jsonify({'status': 'error', 'message': 'Invalid company_id format'}), 400

    cur = None
    try:
        cur = mysql.connection.cursor()
        app.logger.debug(f"Analytics: Querying data for company_id {company_id_int}.")

        # NOTE: These queries still JOIN across logical service boundaries (bookings, employees)
        # This works initially because they share the DB instance.
        # Ideal future state: Analytics service gets data via APIs or events.

        # 1. Bookings per airline
        cur.execute("""
            SELECT b.airline, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s AND b.status = 'Confirmed' /* Added status filter */
            GROUP BY b.airline ORDER BY total DESC
        """, (company_id_int,))
        bookings_per_airline = cur.fetchall()

        # 2. Bookings over time
        cur.execute("""
            SELECT DATE(b.booking_time) AS date, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s AND b.status = 'Confirmed' /* Added status filter */
                  AND b.booking_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(b.booking_time) ORDER BY date ASC
        """, (company_id_int,))
        bookings_over_time = cur.fetchall()
        # Convert date objects to strings for JSON
        for item in bookings_over_time:
            if isinstance(item.get('date'), (datetime.date, datetime.datetime)):
                item['date'] = item['date'].isoformat()

        # 3. Top 5 destinations
        cur.execute("""
            SELECT b.destination, COUNT(*) AS total
            FROM bookings b JOIN employees e ON b.employee_id = e.id
            WHERE e.company_id = %s AND b.status = 'Confirmed' /* Added status filter */
            GROUP BY b.destination ORDER BY total DESC LIMIT 5
        """, (company_id_int,))
        top_destinations = cur.fetchall()

        app.logger.info(f"Analytics: Data fetched successfully for company_id {company_id_int}.")
        return jsonify({
            'bookings_per_airline': bookings_per_airline,
            'bookings_over_time': bookings_over_time,
            'top_destinations': top_destinations
        }), 200

    except Exception as e:
        app.logger.error(f"Analytics Service error for company_id {company_id_int}: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to fetch analytics'}), 500
    finally:
        if cur:
            cur.close()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "analytics"}), 200

# No __main__ block