// src/components/AcceptInsurance.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AcceptInsurance.css'; // Make sure this CSS file exists

// --- Service Endpoints ---
const POLICY_SERVICE_ENDPOINT = 'http://bore.pub:3743/api/policies/external';
const DOCUMENT_SERVICE_ENDPOINT = 'http://bore.pub:36781/api/documents/';
const EMAIL_SERVICE_ENDPOINT = 'http://bore.pub:12026/send-suds-email';
// *** ADD SMS Service Endpoint ***
const SMS_SERVICE_ENDPOINT = 'http://bore.pub:34664/send-suds-sms'; // Your SMS endpoint
// Public base URL for fixing document link
const DOCUMENT_SERVICE_PUBLIC_BASE_URL = 'http://bore.pub:36781';
// --------------------------

// *** HELPER FUNCTION: Format Date ***
const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString + 'T00:00:00');
        if (isNaN(date)) throw new Error("Invalid Date object");
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    } catch (e) { console.error("Error formatting display date:", dateString, e); return dateString; }
};
// **********************************

// *** HELPER FUNCTION: Fix URL ***
const fixDocumentUrl = (internalUrl) => {
    if (!internalUrl || typeof internalUrl !== 'string') {
        return null;
    }
    try {
        // Target hostname and port to replace (adjust if backend changes)
        const internalHostPort = "host.docker.internal:8004";

        // Check if the internal host/port is actually in the URL before replacing
        if (!internalUrl.includes(internalHostPort)) {
             console.log(`URL "${internalUrl}" does not contain internal host "${internalHostPort}", returning as is.`);
             return internalUrl; // Assume it's already correct or different format
        }

        const urlObject = new URL(internalUrl);
        const pathAndFilename = urlObject.pathname; // Gets "/documents/policy_123.pdf"

        // Combine the public base URL with the extracted path
        const publicUrl = DOCUMENT_SERVICE_PUBLIC_BASE_URL + pathAndFilename;
        console.log(`Fixed URL: ${internalUrl} -> ${publicUrl}`);
        return publicUrl;

    } catch (e) {
        console.error("Error fixing document URL:", internalUrl, e);
        return internalUrl; // Return original on error
    }
};
// *********************************

function AcceptInsurance() {
    const location = useLocation();
    const navigate = useNavigate();

    // --- Retrieve State ---
    const { user, pendingBooking, policyDetails } = location.state || {};
    // ----------------------

    // --- API/UI State ---
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('Confirming your insurance policy...');
    const [messageType, setMessageType] = useState('info');
    const [documentUrl, setDocumentUrl] = useState(null);
    // ------------------

    // --- useEffect to call APIs sequentially: Policy -> Document -> Email -> SMS ---
    useEffect(() => {
        let isMounted = true;

        // Declare final status variables OUTSIDE the async function
        let finalMessage = 'Processing...';
        let finalMessageType = 'info';
        let finalPublicDocUrl = null;
        let shouldNavigate = false;
        let navigationDelay = 5000;

        const processPolicyFlow = async () => {
            // Pre-checks (Include check for user.phoneNumber for SMS)
            if (!user?.id || !user?.email || !user?.phoneNumber || !policyDetails /*... other checks */ ) {
                 finalMessage = "❌ Error: Missing required user info (ID, Email, Phone) or policy details.";
                 finalMessageType = "error";
                 return; // Exit early
            }
             const userIdInt = parseInt(policyDetails.user_id, 10);
             if (isNaN(userIdInt)) { /* Handle Invalid User ID */ finalMessage = `❌ Error: Invalid User ID.`; finalMessageType = "error"; return; }
            //---------------------

            let policyId = null;
            let docGenerated = false;
            let emailSent = false;
            let smsSent = false; // <-- Track SMS status
            let currentMessage = '';
            let currentMessageType = 'info';

            // --- Step 1: Create Policy ---
            try {
                 if (!isMounted) return;
                 setMessage('Creating insurance policy...'); setMessageType('info');
                 // ... (Prepare policyPayload) ...
                 let policyPayload; try { const coverageInt = parseInt(policyDetails.coverage_amount, 10); const premiumInt = Math.round(policyDetails.premium); if (isNaN(coverageInt) || isNaN(premiumInt)) throw new Error("Invalid coverage or premium."); policyPayload = { user_id: userIdInt, policy_type: policyDetails.policy_type || "travel", start_date: policyDetails.start_date, end_date: policyDetails.end_date, coverage_amount: coverageInt, premium: premiumInt }; } catch (e) { throw e; }
                 const policyResponse = await axios.post(POLICY_SERVICE_ENDPOINT, policyPayload, { timeout: 15000 });
                 if (policyResponse.status >= 200 && policyResponse.status < 300 && policyResponse.data?.id) {
                     policyId = policyResponse.data.id; console.log(`Policy created (ID: ${policyId})`);
                 } else { throw new Error(policyResponse.data?.detail || 'Policy creation failed.'); }
            } catch (error) {
                // ... (Handle Policy Creation Error) ...
                console.error("Policy Creation Error:", error); finalMessage = '❌ Failed to create insurance policy. '; if(error.response){finalMessage += error.response.data?.detail||`Status ${error.response.status}.`}else{finalMessage += error.message||'Network issue?'} finalMessageType = 'error'; return; // Stop flow
            }

            // --- Step 2: Generate Document ---
            if (policyId && isMounted) {
                currentMessage = ''; currentMessageType = 'info'; // Reset interim
                try {
                    if (!isMounted) return;
                    setMessage('Generating policy document...'); setMessageType('info');
                    // ... (Prepare documentPayload) ...
                    const documentPayload = { policy_id: policyId, document_type: "Policy Certificate" };
                    const documentResponse = await axios.post(DOCUMENT_SERVICE_ENDPOINT, documentPayload, { timeout: 20000 });
                    if (documentResponse.status >= 200 && documentResponse.status < 300 && documentResponse.data?.document_url) {
                        const docUrl = documentResponse.data.document_url;
                        finalPublicDocUrl = fixDocumentUrl(docUrl); // Store fixed URL in outer scope
                        docGenerated = true; console.log("Document generated.");
                    } else { throw new Error(documentResponse.data?.detail || 'Document generation failed.'); }
                } catch (error) {
                    // ... (Handle Document Generation Error - set currentMessage/Type, finalPublicDocUrl) ...
                     console.error("Document Generation Error:", error); currentMessage = `Policy created (ID: ${policyId}), but doc gen failed. `; if (error.response) { currentMessage += error.response.data?.detail || `Status ${error.response.status}.`; } else { currentMessage += error.message || 'Network issue?'; } currentMessageType = 'warning'; const maybeUrl = error.response?.data?.document_url; finalPublicDocUrl = maybeUrl ? fixDocumentUrl(maybeUrl) : null;
                }
            }

            // --- Step 3: Send Confirmation Email ---
            if (policyId && isMounted) {
                 try {
                     if (!isMounted) return;
                     setMessage(currentMessage || 'Sending confirmation email...'); // Show interim status
                     setMessageType(currentMessageType);
                     // ... (Prepare emailPayload - check camelCase) ...
                      const emailPayload = { email: user.email, policyId: policyId, userId: userIdInt, policyType: policyDetails.policy_type || "travel", startDate: policyDetails.start_date, endDate: policyDetails.end_date, coverageAmount: parseInt(policyDetails.coverage_amount, 10) || 0, premium: Math.round(policyDetails.premium) || 0 };
                     const emailResponse = await axios.post(EMAIL_SERVICE_ENDPOINT, emailPayload, { timeout: 15000 });
                     if (emailResponse.status >= 200 && emailResponse.status < 300 && emailResponse.data?.id) {
                         console.log("Email sent successfully."); emailSent = true;
                     } else { throw new Error(emailResponse.data?.detail || `Email service error status ${emailResponse.status}.`); }
                 } catch (error) {
                    // ... (Handle Email Sending Error - update currentMessage/Type) ...
                     console.error("Email Sending Error:", error); let emailErrorMsg = 'Failed to send email. '; if (error.response) { emailErrorMsg += error.response.data?.detail || `Status ${error.response.status}.`; } else { emailErrorMsg += error.message || 'Network issue?'; } if (currentMessageType === 'warning') { currentMessage = `${currentMessage} Also, ${emailErrorMsg}`; } else { currentMessage = `Policy (ID: ${policyId}) & Doc OK, but ${emailErrorMsg}`; currentMessageType = 'warning'; }
                 }
            }

             // --- Step 4: Send Confirmation SMS ---
             if (policyId && isMounted) {
                 try {
                     if (!isMounted) return;
                     setMessage(currentMessage || 'Sending confirmation SMS...'); // Show interim status
                     setMessageType(currentMessageType);

                     // Prepare payload using camelCase for Flask service
                     const smsPayload = {
                         phone: user.phoneNumber, // Get phone number from user state
                         policyId: policyId,
                         userId: userIdInt,
                         policyType: policyDetails.policy_type || "travel",
                         startDate: policyDetails.start_date,
                         endDate: policyDetails.end_date,
                         coverageAmount: parseInt(policyDetails.coverage_amount, 10) || 0,
                         premium: Math.round(policyDetails.premium) || 0
                     };

                     console.log("Sending payload to SMS Service:", smsPayload);
                     const smsResponse = await axios.post(SMS_SERVICE_ENDPOINT, smsPayload, { timeout: 15000 });
                     console.log("SMS service response:", smsResponse.data);

                     if (smsResponse.status >= 200 && smsResponse.status < 300 && smsResponse.data?.sid) {
                         console.log("SMS sent successfully.");
                         smsSent = true; // Mark SMS success
                     } else {
                         throw new Error(smsResponse.data?.detail || `SMS service error status ${smsResponse.status}.`);
                     }

                 } catch (error) {
                     // Handle SMS Sending Error
                     console.error("SMS Sending Error:", error);
                     let smsErrorMsg = 'Failed to send SMS confirmation. ';
                     if (error.response) { smsErrorMsg += error.response.data?.detail || `Status ${error.response.status}.`; }
                     else { smsErrorMsg += error.message || 'Network issue?'; }

                     // Update overall status message
                     if (currentMessageType === 'warning') { // If email or doc already failed
                         currentMessage = `${currentMessage} Additionally, ${smsErrorMsg}`;
                     } else { // Policy/Doc/Email OK, but SMS failed
                         currentMessage = `Policy (ID: ${policyId}) processed, but ${smsErrorMsg}`;
                         currentMessageType = 'warning'; // Set overall status to warning
                     }
                 }
             }
             // --- End Step 4 ---

            // --- Determine Final Status ---
            // Updates the outer-scoped variables
            if (policyId) {
                 if (docGenerated && emailSent && smsSent) { // ALL Success
                     finalMessage = `✅ Success! Policy ${policyId} created, document generated, email & SMS sent. Redirecting...`;
                     finalMessageType = 'success';
                     shouldNavigate = true; navigationDelay = 4000;
                 } else { // At least one notification/doc failed
                     finalMessage = `⚠️ Policy ${policyId} created. `;
                     if (!docGenerated) finalMessage += "Doc generation failed. ";
                     if (!emailSent) finalMessage += "Email sending failed. ";
                     if (!smsSent) finalMessage += "SMS sending failed. ";
                     finalMessage += `${currentMessage || ''} Redirecting...`; // Append specific errors if captured
                     finalMessageType = 'warning';
                     shouldNavigate = true; // Still navigate on warning
                 }
            }
            // Policy fail case handled earlier by setting finalMessage/Type directly

        }; // --- End of processPolicyFlow async function ---

        // Execute the async function and then update state & navigate
        processPolicyFlow().finally(() => {
            if (isMounted) {
                setMessage(finalMessage); // Set final UI message
                setMessageType(finalMessageType); // Set final UI type
                if(finalPublicDocUrl) setDocumentUrl(finalPublicDocUrl); // Set final URL state
                setIsLoading(false); // Final loading state update

                if (shouldNavigate) {
                     setTimeout(() => {
                        if (isMounted) navigate('/dashboard', { state: { user } });
                     }, navigationDelay);
                }
            }
        });

        // Cleanup function
        return () => { isMounted = false; };

    }, [user, policyDetails, pendingBooking, navigate]); // Dependencies

    // --- Early return check ---
    if (!user || !pendingBooking || !policyDetails) { /* ... same early return ... */ }

    // --- Render UI ---
    return (
        <div className="accept-insurance-page">
            <div className="accept-insurance-content-box">
                <h2>Confirming Insurance Policy</h2>
                <div className="accept-insurance-summary">
                     {/* ... summary details ... */}
                     <p><strong>Passenger:</strong> {user.name} ({user.email})</p>
                     <p><strong>Phone:</strong> {user.phoneNumber || 'N/A'}</p> {/* Display phone */}
                     <p><strong>Destination:</strong> {pendingBooking.destination}</p>
                     <p><strong>Policy Type:</strong> {policyDetails.policy_type}</p>
                     <p><strong>Coverage Dates:</strong> {formatDateForDisplay(policyDetails.start_date)} to {formatDateForDisplay(policyDetails.end_date)}</p>
                     <p><strong>Coverage Amount:</strong> ${policyDetails.coverage_amount?.toLocaleString()}</p>
                     <p><strong>Premium:</strong> ${policyDetails.premium?.toLocaleString()}</p>
                </div>
                <div className="accept-insurance-status">
                    {isLoading && <div className="spinner"></div>}
                    {message && ( <p className={`accept-insurance-message ${messageType}`}>{message}</p> )}
                    {/* Document Link */}
                    {(messageType === 'success' || messageType === 'warning') && documentUrl && !isLoading && (
                        <div className="document-link-container" style={{ marginTop: '15px' }}>
                            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="accept-insurance-button document-link" style={{ display: 'inline-block', width: 'auto', background: '#17a2b8' }}>
                                📄 View/Download Policy Document
                            </a>
                        </div>
                    )}
                </div>
                {/* Back Button */}
                {(messageType === 'error' || messageType === 'warning') && !isLoading && (
                     <button onClick={() => navigate(-1)} className="accept-insurance-button back">
                        🔙 Back to Insurance Options
                    </button>
                )}
            </div>
        </div>
    );
}

export default AcceptInsurance;