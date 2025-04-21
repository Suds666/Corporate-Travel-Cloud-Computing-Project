// src/components/Insurance.js
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Insurance.css'; // Import the CSS file

// --- Service Endpoint ---
const QUOTE_SERVICE_ENDPOINT = 'http://bore.pub:16876/quotes'; // Or 21166
// --- REMOVED Policy Service Endpoint ---
// --------------------------

// Helper function (optional)
const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A'; try { const date = new Date(dateString + 'T00:00:00'); if (isNaN(date)) throw new Error("Invalid Date object"); return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { console.error("Error formatting display date:", dateString, e); return dateString; }
};

function Insurance() {
    const location = useLocation();
    const navigate = useNavigate();

    const user = location.state?.user;
    const pendingBooking = location.state?.pendingBooking;

    // --- Derived Age ---
    const { derivedAge } = useMemo(() => { /* ... age derivation logic ... */ let extractedAge = null; if (user?.age) { const parsedAge = parseInt(user.age, 10); if (!isNaN(parsedAge) && parsedAge > 0) { extractedAge = parsedAge; console.log("Using derived age from user object:", extractedAge); } else { console.warn("Received invalid age in user object:", user.age); } } else { console.warn("User age missing from state. Input required."); } return { derivedAge: extractedAge }; }, [user]);

    // --- Form State ---
    const [formData, setFormData] = useState({
        age: derivedAge ? String(derivedAge) : '',
        start_date: '',
        end_date: '',
        pre_existing_conditions: '',
        coverage_amount: '',
    });

    // --- API/UI State ---
    const [isLoading, setIsLoading] = useState(false); // Loading for quote generation
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [quoteResult, setQuoteResult] = useState(null); // Stores { id, premium, expiry }

    // --- Effects ---
    useEffect(() => { /* ... sync form age ... */ if (derivedAge && String(derivedAge) !== formData.age) { setFormData(prev => ({ ...prev, age: String(derivedAge) })); } }, [derivedAge, formData.age]);

    // --- Event Handlers ---
    const handleInputChange = (e) => { /* ... same input change logic ... */ const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); if (message) setMessage(''); if (quoteResult) setQuoteResult(null); };

    // --- API Call: Get Quote ---
    const handleGetQuote = async (e) => { /* ... same quote fetching logic ... */
        e.preventDefault(); setIsLoading(true); setMessage('Generating insurance quote...'); setMessageType('info'); setQuoteResult(null);
        let ageForQuote = derivedAge; if (!ageForQuote) { if (!formData.age) { setMessage('Please enter Age.'); setMessageType('error'); setIsLoading(false); return; } const parsedFormAge = parseInt(formData.age, 10); if (isNaN(parsedFormAge) || parsedFormAge <= 0) { setMessage('Invalid Age.'); setMessageType('error'); setIsLoading(false); return; } ageForQuote = parsedFormAge; }
        if (!formData.coverage_amount || isNaN(parseFloat(formData.coverage_amount)) || parseFloat(formData.coverage_amount) <= 0) { setMessage('Invalid Coverage Amount.'); setMessageType('error'); setIsLoading(false); return; }
        if (!formData.start_date) { setMessage('Select Start Date.'); setMessageType('error'); setIsLoading(false); return; } if (!formData.end_date) { setMessage('Select End Date.'); setMessageType('error'); setIsLoading(false); return; } if (new Date(formData.start_date) >= new Date(formData.end_date)) { setMessage('End Date must be after Start Date.'); setMessageType('error'); setIsLoading(false); return; }
        const quotePayload = { user_id: user.email || `unknown-${Date.now()}`, insurance_type: 'travel', destination: pendingBooking.destination, start_date: formData.start_date, end_date: formData.end_date, age: ageForQuote, pre_existing_conditions: formData.pre_existing_conditions || null, coverage_amount: parseFloat(formData.coverage_amount) };
        console.log("Sending payload to quote service:", quotePayload);
        try { const response = await axios.post(QUOTE_SERVICE_ENDPOINT, quotePayload, { timeout: 10000 }); console.log("Quote service response:", response.data); if (response.data?.calculated_premium !== undefined && response.data?.id !== undefined) { setQuoteResult({ id: response.data.id, premium: response.data.calculated_premium, expiry: response.data.quote_expiry ? new Date(response.data.quote_expiry).toLocaleString() : 'N/A' }); setMessage(`✅ Quote generated!`); setMessageType('success'); } else { throw new Error("Invalid response format."); } }
        catch (error) { console.error("Error fetching quote:", error); let errorMsg = 'Failed to get quote. '; if (error.response) { errorMsg += (error.response.status === 422) ? `Validation failed: ${error.response.data?.detail || 'Check data.'}` : `Server error ${error.response.status}.`; } else errorMsg += error.request ? 'No response.' : error.code === 'ECONNABORTED' ? 'Timeout.' : `Error: ${error.message}`; setQuoteResult(null); setMessage(errorMsg); setMessageType('error'); } finally { setIsLoading(false); }
    };

    // --- *** UPDATED: Accept Handler navigates to AcceptInsurance *** ---
    const handleAcceptQuote = () => {
        if (!quoteResult || !user || !pendingBooking) {
            setMessage("Cannot proceed: Missing quote, user, or booking details.");
            setMessageType('error');
            return;
        }
        // Check form data needed for policy is present
        if (!formData.start_date || !formData.end_date || !formData.coverage_amount) {
             setMessage("Cannot proceed: Missing form details (dates, coverage).");
             setMessageType('error');
             return;
        }

        console.log("Quote Accepted, navigating to policy creation page.");
        setMessage("Proceeding to policy confirmation...");
        setMessageType("info");

        // Prepare data to pass to the next step
        const policyData = {
            user_id: user.id, // Assuming user.id is the required integer ID
            policy_type: "travel",
            start_date: formData.start_date,
            end_date: formData.end_date,
            // Parse coverage and premium here to pass correct types if possible
            coverage_amount: parseInt(formData.coverage_amount, 10) || 0, // Default to 0 if parse fails
            premium: Math.round(quoteResult.premium) || 0, // Default to 0 if parse fails
            quote_id: quoteResult.id // Pass quote ID if needed later
        };

        // Navigate to the new component, passing necessary state
        navigate('/accept-insurance', {
            state: {
                user, // Pass original user object
                pendingBooking, // Pass original booking object
                policyDetails: policyData // Pass the prepared policy data
            }
        });
    };
    // --- *** END UPDATED Accept Handler *** ---

    // --- Decline Handler navigates to Dashboard ---
    const handleDeclineQuote = () => {
        // No API call here, just navigate
        setIsLoading(true); // Show brief loading indication
        console.log("Quote Declined, navigating to dashboard.");
        setMessage("Proceeding without insurance...");
        setMessageType("info");
        setTimeout(() => {
            navigate('/dashboard', { state: { user } });
        }, 1000); // Short delay
    };
    // ------------------------------------------

    // --- Early Return Check ---
    if (!user || !pendingBooking) { return ( <div className="insurance-page"><div className="insurance-content-box"><p className="insurance-message error">❌ Error: Missing user/booking info.</p><button onClick={() => navigate('/login')} className="insurance-button back">Go to Login</button></div></div> ); }

    // --- Button Disabled States ---
    const getQuoteDisabled = isLoading || !!quoteResult || !formData.coverage_amount || !formData.start_date || !formData.end_date || (!derivedAge && !formData.age);
    const actionButtonsDisabled = isLoading; // Disable accept/decline only during quote fetching

    // --- Render Component ---
    return (
        <div className="insurance-page">
            <div className="insurance-content-box">
                <h2>Travel Insurance</h2>

                {/* Display Confirmed Info */}
                <div className="insurance-user-info">
                     <p><strong>Passenger:</strong> {user.name} ({user.email})</p>
                     {derivedAge && <p><strong>Age (from Visa):</strong> {derivedAge}</p>}
                     <p><strong>Flight Destination:</strong> {pendingBooking.destination}</p>
                     <p><strong>Seat:</strong> {pendingBooking.seat_number}</p>
                </div>

                <p>Select coverage dates and provide details for your optional travel insurance quote.</p>

                {/* Insurance Quote Form */}
                <form onSubmit={handleGetQuote} className="insurance-form">
                    {/* Inputs for Age (conditional), Dates, Coverage, Conditions */}
                    {!derivedAge && ( <div className="insurance-form-group"> <label htmlFor="age">Your Age *</label> <input type="number" id="age" name="age" value={formData.age} onChange={handleInputChange} required min="1" placeholder="Enter your age" disabled={isLoading || !!quoteResult} /> </div> )}
                    <div className="insurance-form-group"> <label htmlFor="start_date">Insurance Start Date *</label> <input type="date" id="start_date" name="start_date" value={formData.start_date} onChange={handleInputChange} required disabled={isLoading || !!quoteResult} /> </div>
                    <div className="insurance-form-group"> <label htmlFor="end_date">Insurance End Date *</label> <input type="date" id="end_date" name="end_date" value={formData.end_date} onChange={handleInputChange} required min={formData.start_date || ''} disabled={isLoading || !!quoteResult} /> </div>
                    <div className="insurance-form-group"> <label htmlFor="coverage_amount">Desired Coverage Amount ($) *</label> <input type="number" id="coverage_amount" name="coverage_amount" value={formData.coverage_amount} onChange={handleInputChange} required min="1" step="100" placeholder="e.g., 5000" disabled={isLoading || !!quoteResult} /> </div>
                    <div className="insurance-form-group"> <label htmlFor="pre_existing_conditions">Pre-existing Conditions (Optional)</label> <textarea id="pre_existing_conditions" name="pre_existing_conditions" value={formData.pre_existing_conditions} onChange={handleInputChange} placeholder="e.g., Asthma, Diabetes..." rows="3" disabled={isLoading || !!quoteResult} /> </div>
                    {/* Get Quote Button */}
                    {!quoteResult && ( <button type="submit" className="insurance-button" disabled={getQuoteDisabled} > {isLoading ? 'Getting Quote...' : 'Get Insurance Quote'} </button> )}
                    {/* Info Messages */}
                    {getQuoteDisabled && !isLoading && !quoteResult && (!derivedAge && !formData.age) && ( <p className="info-message small">Please enter age.</p> )}
                    {getQuoteDisabled && !isLoading && !quoteResult && (!formData.start_date || !formData.end_date) && ( <p className="info-message small">Please select dates.</p> )}
                    {getQuoteDisabled && !isLoading && !quoteResult && !formData.coverage_amount && ( <p className="info-message small">Please enter coverage amount.</p> )}
                </form>

                {/* Display Message Area */}
                {message && ( <p className={`insurance-message ${messageType}`}>{message}</p> )}

                {/* Display Quote Result and Actions */}
                {quoteResult && messageType === 'success' && (
                    <div className="insurance-quote-result">
                        <h3>Your Quote</h3>
                        <p>Calculated Premium: <strong>${quoteResult.premium.toFixed(2)}</strong></p>
                        <p>Quote Valid Until: {quoteResult.expiry}</p>
                        <p>Quote ID: {quoteResult.id}</p>
                        <div className="insurance-actions">
                            {/* Updated Button Text */}
                            <button onClick={handleAcceptQuote} className="insurance-button accept" disabled={actionButtonsDisabled}>
                                {isLoading ? 'Processing...' : 'Accept Quote & Confirm Policy'}
                            </button>
                            <button onClick={handleDeclineQuote} className="insurance-button decline" disabled={actionButtonsDisabled}>
                                {isLoading ? 'Processing...' : 'No Thanks, Go to Dashboard'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Back Button */}
                <button onClick={() => navigate(-1)} disabled={isLoading} className="insurance-button back">🔙 Back</button>
            </div>
        </div>
    );
}

export default Insurance;