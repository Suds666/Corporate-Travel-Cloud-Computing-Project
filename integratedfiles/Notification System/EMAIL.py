from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import base64
import pymongo
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:3000","http://159.223.171.199:56300", "http://localhost:8501", "http://localhost:8000" ])

# MongoDB
client = pymongo.MongoClient("mongodb://host.docker.internal:27017")
db = client["email_db"]
emails = db["email_notification"]

# Gmail API setup
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

def get_gmail_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def create_message(sender, to, subject, message_text):
    message = MIMEText(message_text)
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

@app.route("/send-email", methods=["POST"])
def send_email():
    data = request.json
    email = data.get("email")
    destination = data.get("destination")
    ticket_type = data.get("ticketType")

    print("📧 Email received in backend:", email)

    if not email:
        return jsonify({"error": "Recipient email missing"}), 400

    subject = f"{ticket_type} Booking Confirmation"
    body = f"Your {ticket_type.lower()} ticket to {destination} has been successfully booked!"

    try:
        service = get_gmail_service()
        message = create_message("me", email, subject, body)
        send_result = service.users().messages().send(userId="me", body=message).execute()

        emails.insert_one({
            "to": email,
            "subject": subject,
            "body": body
        })

        return jsonify({"message": "Email sent", "id": send_result['id']}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Create a new database and collection for this client
suds_db = client["suds_db"]
suds_emails = suds_db["email"]

@app.route("/send-suds-email", methods=["POST"])
def send_suds_email():
    data = request.json
    email = data.get("email")
    policy_id = data.get("policyId")
    user_id = data.get("userId")
    policy_type = data.get("policyType")
    coverage_amount = data.get("coverageAmount")
    premium = data.get("premium")
    start_date = data.get("startDate")
    end_date = data.get("endDate")

    print("📧 SUDS client email received:", email)

    if not all([email, policy_id, user_id, policy_type, coverage_amount, premium, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400

    subject = "SUDS Policy Confirmation"
    body = f"""\
    Policy ID: {policy_id}
    User ID: {user_id}
    Policy Type: {policy_type}
    Coverage Amount: ₹{coverage_amount}
    Premium: ₹{premium}
    Start Date: {start_date}
    End Date: {end_date}
    Thank you for choosing our services."""

    try:
        service = get_gmail_service()
        message = create_message("me", email, subject, body)
        send_result = service.users().messages().send(userId="me", body=message).execute()

        suds_emails.insert_one({
            "to": email,
            "subject": subject,
            "body": body,
            "status": "sent",
            "message_id": send_result["id"]
        })

        return jsonify({"message": "Email sent to SUDS client", "id": send_result['id']}), 200

    except Exception as e:
        suds_emails.insert_one({
            "to": email,
            "subject": subject,
            "body": body,
            "status": "failed",
            "error": str(e)
        })

        return jsonify({"error": str(e)}), 500
       
@app.route("/send-quote-email", methods=["POST"])
def send_quote_email():
    data = request.json
    to = data.get("to")
    subject = data.get("subject")
    body = data.get("body")

    if not to or not subject or not body:
        return jsonify({"error": "Missing 'to', 'subject', or 'body' in request"}), 400

    try:
        service = get_gmail_service()
        message = create_message("me", to, subject, body)
        send_result = service.users().messages().send(userId="me", body=message).execute()

        emails.insert_one({
            "to": to,
            "subject": subject,
            "body": body
        })

        return jsonify({"message": "Quote email sent", "id": send_result["id"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route("/send-offer-email", methods=["POST"])
def send_offer_email():
    data = request.json
    email = data.get("email")
    offers = data.get("offers")

    if not email or not offers:
        return jsonify({"error": "Email or offers list missing"}), 400

    print("📩 Sending personalized offers to:", email)

    subject = "🎉 Exclusive Travel Offers Just for You!"

    # Construct the email body from offers
    body_lines = ["Here are some exciting personalized travel deals just for you:\n"]
    for idx, offer in enumerate(offers, 1):
        destination = offer.get("destination", "Unknown")
        offer_type = offer.get("offer_type", "Unknown Package")
        price = offer.get("price_usd", 0)
        discount = offer.get("discount_percent", 0)
        description = offer.get("description", "")

        line = (
            f"{idx}. ✈️ {destination} — {offer_type}\n"
            f"   • {description}\n"
            f"   • Price: ${price}\n"
            f"   • Discount: {discount}% OFF\n"
        )
        body_lines.append(line)

    body = "\n".join(body_lines)

    try:
        service = get_gmail_service()
        message = create_message("me", email, subject, body)
        send_result = service.users().messages().send(userId="me", body=message).execute()

        # Log in MongoDB
        emails.insert_one({
            "to": email,
            "subject": subject,
            "body": body,
            "offers": offers,
            "status": "sent",
            "message_id": send_result["id"]
        })

        return jsonify({"message": "Offer email sent", "id": send_result["id"]}), 200

    except Exception as e:
        emails.insert_one({
            "to": email,
            "subject": subject,
            "body": body,
            "offers": offers,
            "status": "failed",
            "error": str(e)
        })
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host='0.0.0.0',port=5002, debug=True)
