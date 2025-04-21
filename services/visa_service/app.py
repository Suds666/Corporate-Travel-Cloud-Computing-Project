# services/visa_service/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import pytesseract
from PIL import Image
import os
import logging
import re # Import regex module
import datetime
from werkzeug.utils import secure_filename # Make sure secure_filename is imported

app = Flask(__name__)
CORS(app)

# --- Logging ---
logging.basicConfig(level=logging.DEBUG)
app.logger.info("Starting Visa Service...")

# --- Upload Folder Config ---
UPLOAD_FOLDER = '/app/visa_uploads'
try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.logger.info(f"Upload folder verified/created: {UPLOAD_FOLDER}")
except OSError as e:
    app.logger.error(f"CRITICAL: Could not create upload folder {UPLOAD_FOLDER}: {e}")

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


# === Helper: Extract Age Function ===
def extract_age_from_text(text):
    """Searches text for 'Age: XX' (case-insensitive) and returns integer age or None."""
    match = re.search(r'\bAge:\s*(\d+)\b', text, re.IGNORECASE)
    if match:
        try:
            age = int(match.group(1))
            app.logger.debug(f"Found age pattern. Extracted age: {age}")
            return age
        except ValueError:
            app.logger.warning(f"Found age pattern '{match.group(0)}' but digits '{match.group(1)}' invalid.")
            return None
    else:
        app.logger.debug("Age pattern 'Age: XX' not found in OCR text.")
        return None

# === Helper: Normalize Phone Number ===
def normalize_phone(phone_string):
    """Removes all non-digit characters from a string."""
    if not phone_string:
        return ""
    return re.sub(r'\D', '', phone_string)


# === Verify Visa Endpoint ===
@app.route('/api/verify-visa', methods=['POST'])
def verify_visa():
    app.logger.info(f"Visa Service received request for {request.endpoint}")
    # --- Access form data (including phone number) ---
    name = request.form.get('name')
    email = request.form.get('email')
    company = request.form.get('company')
    destination = request.form.get('destination')
    phone = request.form.get('phone') # Get the phone number
    file = request.files.get('visa')

    app.logger.debug(f"Visa verification attempt: Name='{name}', Email='{email}', Company='{company}', Destination='{destination}', Phone='{phone}', File={file.filename if file else 'None'}")

    # --- Updated validation for incoming data (including phone) ---
    if not all([name, email, company, destination, phone, file]): # Add phone check
        missing = []
        if not name: missing.append("name")
        if not email: missing.append("email")
        if not company: missing.append("company")
        if not destination: missing.append("destination")
        if not phone: missing.append("phone number") # Add phone to missing check
        if not file: missing.append("visa file")
        app.logger.warning(f"Visa verification failed: Missing required form data: {', '.join(missing)}")
        return jsonify({'status': 'error', 'message': f'Missing visa upload data: {", ".join(missing)}'}), 400

    # --- Basic filename handling ---
    if not file.filename:
         app.logger.warning("Uploaded file has no filename. Generating a default.")
         # Simplified default name generation
         filename = f"uploaded_visa_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}.bin" # Add microseconds for more uniqueness
         # Try to guess extension if needed, but secure_filename below is better
    else:
        filename = secure_filename(file.filename)

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    app.logger.info(f"Attempting to save visa file to: {filepath}")

    try:
        file.save(filepath)
        app.logger.info(f"Visa file saved successfully to: {filepath}")
    except Exception as e:
        app.logger.error(f"Error saving uploaded visa file {filename}: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to save uploaded file'}), 500

    # --- Process the saved file ---
    extracted_age = None
    try:
        app.logger.debug(f"Starting OCR processing for file: {filepath}")
        text = "" # Initialize text
        if filename.lower().endswith('.pdf'):
             app.logger.warning("PDF processing might be basic. Requires pdf2image for full support.")
             # Attempting basic OCR on PDF (might fail or be partial)
             try:
                 # Requires poppler-utils (apt-get install poppler-utils)
                 # Requires pdf2image (pip install pdf2image)
                 # from pdf2image import convert_from_path
                 # images = convert_from_path(filepath)
                 # full_text = ""
                 # for i, page_image in enumerate(images):
                 #    page_text = pytesseract.image_to_string(page_image)
                 #    full_text += page_text + "\n--- Page Break ---\n"
                 #    app.logger.debug(f"OCR processed PDF page {i+1}")
                 # text = full_text

                 # --- SIMPLER (less reliable) fallback for demo ---
                 text = pytesseract.image_to_string(filepath) # May get metadata or fail

             except pytesseract.TesseractError as ocr_err:
                  app.logger.error(f"Tesseract failed on PDF {filepath}: {ocr_err}")
                  text = ""
             except Exception as pdf_err: # Catch potential pdf2image errors if used
                  app.logger.error(f"Error processing PDF {filepath}: {pdf_err}")
                  text = ""
        else:
             # Process as image
             img = Image.open(filepath)
             text = pytesseract.image_to_string(img)
             img.close()

        app.logger.debug("OCR processing completed.")
        log_sample = text[:500].replace('\n', '\\n')
        app.logger.debug(f"OCR Output sample: {log_sample}{'...' if len(text) > 500 else ''}")

        # --- Perform verification checks (case-insensitive where appropriate) ---
        name_lower = name.lower()
        email_lower = email.lower()
        company_lower = company.lower()
        destination_lower = destination.lower()
        text_lower = text.lower()

        # --- Normalize phone numbers for comparison ---
        normalized_phone_expected = normalize_phone(phone)
        normalized_text = normalize_phone(text)
        app.logger.debug(f"Normalized Expected Phone: '{normalized_phone_expected}'")
        # Only log a sample of normalized text for privacy/brevity if long
        normalized_text_sample = normalized_text[:100]
        app.logger.debug(f"Normalized OCR Text Sample (first 100 digits): '{normalized_text_sample}{'...' if len(normalized_text) > 100 else ''}'")


        # --- Updated Matches ---
        name_match = name_lower in text_lower
        email_match = email_lower in text_lower
        company_match = company_lower in text_lower
        destination_match = destination_lower in text_lower
        # Check if the *normalized* expected phone number exists in the *normalized* OCR text
        phone_match = normalized_phone_expected in normalized_text if normalized_phone_expected else False # Avoid checking empty string

        extracted_age = extract_age_from_text(text)
        # -------------------------------

        app.logger.debug(f"Verification Checks: Name: {name_match}, Email: {email_match}, Company: {company_match}, Destination: {destination_match}, Phone: {phone_match}, Age Found: {extracted_age is not None}")

        # --- Updated Verification logic including Phone check ---
        if name_match and email_match and company_match and destination_match and phone_match and extracted_age is not None:
            app.logger.info(f"Visa verification SUCCESS for Name='{name}', Dest='{destination}', Phone='{phone}', Age='{extracted_age}'")
            # os.remove(filepath) # Optional cleanup
            return jsonify({
                'status': 'success',
                'message': f'✅ Visa verified successfully (including destination, phone, and age). Extracted Age: {extracted_age}',
                'extracted_age': extracted_age
                }), 200
        else:
            app.logger.warning(f"Visa verification FAILED for Name='{name}', Dest='{destination}', Phone='{phone}'")
            # os.remove(filepath) # Optional cleanup
            missing_details = []
            if not name_match: missing_details.append("name")
            if not email_match: missing_details.append("email")
            if not company_match: missing_details.append("company")
            if not destination_match: missing_details.append(f"destination ({destination})")
            if not phone_match: missing_details.append("phone number") # Add phone failure reason
            if extracted_age is None: missing_details.append("age (expected format 'Age: XX')")

            message = f'❌ Visa details mismatch or required info not found. Check failed for: {", ".join(missing_details)}.' if missing_details else '❌ Visa details do not match required criteria.'
            return jsonify({'status': 'error', 'message': message}), 403

    except pytesseract.TesseractNotFoundError:
        app.logger.error("Tesseract executable not found.")
        return jsonify({'status': 'error', 'message': 'Server configuration error: OCR engine not found.'}), 500
    except FileNotFoundError:
         app.logger.error(f"File not found for processing: {filepath}")
         return jsonify({'status': 'error', 'message': 'Server error: Could not find saved file.'}), 500
    except Image.UnidentifiedImageError:
        app.logger.error(f"Cannot identify image file format or file is corrupted: {filepath}")
        return jsonify({'status': 'error', 'message': 'Uploaded file is not a valid or supported image format.'}), 400
    except Exception as e:
        app.logger.error(f"Error during OCR or verification process for {filepath}: {str(e)}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'OCR processing failed or other internal error occurred.'}), 500
    finally:
        # Cleanup: Consider moving to a background task if files need temporary retention
        if os.path.exists(filepath):
           try:
               os.remove(filepath)
               app.logger.debug(f"Cleaned up file: {filepath}")
           except OSError as e:
               app.logger.warning(f"Could not remove file {filepath} after processing: {e}")


# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "visa"}), 200

# No __main__ block needed for Gunicorn/Flask CLI