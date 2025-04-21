from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from twilio.rest import Client
import pymongo

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:3000", "http://159.223.171.199:56300", "http://localhost:8501"])

client = pymongo.MongoClient("mongodb://host.docker.internal:27017")
db = client["sms_db"]
sms_col = db["sms_notification"]

twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_number = os.getenv("TWILIO_PHONE_NUMBER")
twilio_client = Client(twilio_sid, twilio_token)

@app.route("/send-sms", methods=["POST"])
def send_sms():
    data = request.json
    phone = data.get("phone")
    destination = data.get("destination")
    ticket_type = data.get("ticketType")
    msg = f"Your {ticket_type.lower()} ticket to {destination} has been booked!"

    try:
        sms = twilio_client.messages.create(
            body=msg,
            from_=twilio_number,
            to=phone
        )

        sms_col.insert_one({
            "to": phone,
            "message": msg,
            "sid": sms.sid
        })

        return jsonify({"message": "SMS sent!", "sid": sms.sid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/send-suds-sms", methods=["POST"])
def send_suds_sms():
    data = request.json
    phone = data.get("phone")
    policy_id = data.get("policyId")
    user_id = data.get("userId")
    policy_type = data.get("policyType")
    coverage_amount = data.get("coverageAmount")
    premium = data.get("premium")
    start_date = data.get("startDate")
    end_date = data.get("endDate")

    if not all([phone, policy_id, user_id, policy_type, coverage_amount, premium, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400

    msg = (
        f"Travel policy confirmed! ID: {policy_id}, ₹{coverage_amount}, ₹{premium}, "
        f"User: {user_id}, Type: {policy_type}, Duration: {start_date} to {end_date}. "
        "Thank you for choosing our services."
    )

    try:
        sms = twilio_client.messages.create(
            body=msg,
            from_=twilio_number,
            to=phone
        )

        sms_col.insert_one({
            "to": phone,
            "message": msg,
            "sid": sms.sid,
            "type": "suds"
        })

        return jsonify({"message": "SUDS SMS sent!", "sid": sms.sid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/send-quote-sms", methods=["POST"])
def send_quote_sms():
    data = request.json
    phone_number = data.get("phone_number")
    message = data.get("message")

    if not phone_number or not message:
        return jsonify({"error": "Missing 'phone_number' or 'message' in request"}), 400

    try:
        sms = twilio_client.messages.create(
            body=message,
            from_=twilio_number,
            to=phone_number
        )

        sms_col.insert_one({
            "to": phone_number,
            "message": message,
            "sid": sms.sid
        })

        return jsonify({"message": "Quote SMS sent!", "sid": sms.sid}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5003, debug=True)
