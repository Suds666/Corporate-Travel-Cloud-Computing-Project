// src/components/UploadVisa.js
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './UploadVisa.css'; // Import the CSS file

// --- Quiz Data ---
const quizQuestions = [
    { q: "The concept of 'umami,' the fifth basic taste, was scientifically identified by a researcher studying a specific type of seaweed broth fundamental to which cuisine?", a: 'japan' },
    { q: "Which cuisine features traditional agricultural and culinary practices so significant they were inscribed on UNESCO's Representative List of the Intangible Cultural Heritage of Humanity?", a: 'mexico' },
    { q: "Despite being iconic today, tomatoes were a New World import and only became widely integrated into the sauces of this cuisine centuries after their introduction to Europe. Which cuisine is it?", a: 'italy' },
    { q: "Due to deep-rooted religious and cultural factors, which cuisine boasts arguably the most extensive and complex array of vegetarian dishes as a core part of its tradition, rather than just an alternative?", a: 'india' },
    { q: "In which cuisine did a globally popular dish involving rice and fish *originally* develop primarily as a method for preserving the fish through fermentation, where the rice was often discarded?", a: 'japan' },
    { q: "This cuisine gave the world foundational ingredients like vanilla, chocolate (cacao), and avocados, which originated in its region. Which cuisine is it?", a: 'mexico' },
    { q: "The careful practice of 'blooming' or toasting whole and ground spices in hot oil or ghee to release their essential oils is a foundational flavour-building technique in which cuisine?", a: 'india' },
    { q: "The sheer variety of pasta shapes (estimated over 350) found in this cuisine isn't just for show; many specific shapes evolved deliberately to better hold or pair with particular types of sauces or ingredients. Which cuisine is this characteristic of?", a: 'italy' },
    { q: "A traditional process called nixtamalization, involving soaking maize (corn) in an alkaline solution, is crucial for unlocking nutrients and creating the doughs essential to which cuisine?", a: 'mexico' },
    { q: "While generalizations are often made, this European cuisine shows stark regional contrasts, for example, between northern areas favouring butter, risotto, and polenta, and southern areas favouring olive oil, dried pasta, and tomatoes. Which cuisine exhibits this strong regional divide?", a: 'italy' },
    { q: "Which cuisine places a profound philosophical emphasis on *shun* (using ingredients at their peak seasonality) and *moritsuke* (the artful, aesthetic presentation of food)?", a: 'japan' },
    { q: "Traveling across different states within this large country reveals dramatically different signature dishes and flavour profiles, heavily influenced by diverse climates, local agriculture, historical invasions (like Mughal), and religious dietary laws. Which cuisine is known for this vast internal diversity?", a: 'india' }
];

const countryIcons = {
    japan: '/images/castle.png',
    mexico: '/images/chichen-itza.png',
    italy: '/images/colosseum.png',
    india: '/images/india-gate.png',
};
// --- End Quiz Data ---

// --- Service Endpoints ---
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const VERIFY_VISA_ENDPOINT = `${API_BASE_URL}/api/verify-visa`;
const FINALIZE_BOOKING_ENDPOINT = `${API_BASE_URL}/api/finalize-booking`; // Added back
// --- Email/SMS Endpoints REMOVED ---
// --------------------------

function UploadVisa() {
    const location = useLocation();
    const navigate = useNavigate();

    const user = location.state?.user;
    const pendingBooking = location.state?.pendingBooking;

    // --- Component State ---
    const [visaFile, setVisaFile] = useState(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isBooking, setIsBooking] = useState(false); // Re-added booking state
    // Removed notification states
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState(''); // 'success' or 'error' or 'warning' or 'info'

    // Quiz State
    const [quizPassed, setQuizPassed] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [quizIncorrectFlash, setQuizIncorrectFlash] = useState(false);

    // Select quiz question
    useEffect(() => {
        if (!quizPassed) {
            const randomIndex = Math.floor(Math.random() * quizQuestions.length);
            setCurrentQuestion(quizQuestions[randomIndex]);
        }
    }, [quizPassed]);

    const iconEntries = useMemo(() => Object.entries(countryIcons), []);

    // --- Notification functions REMOVED ---

    const handleFileChange = (e) => {
        if (e.target.files?.length > 0) setVisaFile(e.target.files[0]);
        else setVisaFile(null);
        setMessage(''); setMessageType('');
    };

    const handleQuizAnswer = (selectedCountryKey) => {
        if (!currentQuestion || quizIncorrectFlash || isLoading) return;
        if (selectedCountryKey === currentQuestion.a) {
            setQuizPassed(true);
            setMessage('Correct! Please proceed with visa upload.');
            setMessageType('success');
        } else {
            setQuizIncorrectFlash(true);
            setMessage('Incorrect answer! Refreshing...');
            setMessageType('error');
            setTimeout(() => { window.location.reload(); }, 1200);
        }
    };

    // *** COMPLETE handleUploadAndBook with Verify Visa -> Finalize Booking -> Navigate to Insurance ***
    const handleUploadAndBook = async (e) => {
        e.preventDefault();

        // --- Pre-checks ---
        if (!user || !pendingBooking || !user.phoneNumber) { // Check essential data
             setMessage('Error: Missing user/booking/phone details. Please go back.');
             setMessageType('error');
             setIsVerifying(false); setIsBooking(false); // Reset states
             return;
        }
        if (!quizPassed) { setMessage('Please complete the quiz first.'); setMessageType('error'); return; }
        if (!visaFile) { setMessage('Please select a visa file.'); setMessageType('error'); return; }
        // --- End Pre-checks ---

        setMessage(''); setMessageType('');
        setIsVerifying(true); // Start verification
        setIsBooking(false);  // Ensure booking state is reset

        // Prepare Form Data for Visa Verification
        const verifyFormData = new FormData();
        verifyFormData.append('visa', visaFile);
        verifyFormData.append('name', user.name);
        verifyFormData.append('email', user.email);
        verifyFormData.append('company', user.company.name);
        verifyFormData.append('destination', pendingBooking.destination);
        verifyFormData.append('phone', user.phoneNumber);

        try {
            // --- Step 1: Verify Visa ---
            console.log("Verifying visa...");
            setMessage('Verifying Visa...'); setMessageType('info');

            const verifyResponse = await axios.post(VERIFY_VISA_ENDPOINT, verifyFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 20000
            });

            // --- Visa Verification Success ---
            if (verifyResponse.data.status === 'success') {
                setIsVerifying(false); // Verification done
                setIsBooking(true);    // Start booking process
                setMessage(verifyResponse.data.message || '✅ Visa verified! Finalizing booking...');
                setMessageType('success'); // Keep success message briefly

                // Get extracted age and update user object locally for passing forward
                const extractedAgeFromVisa = verifyResponse.data.extracted_age;
                const updatedUser = { ...user, age: extractedAgeFromVisa };
                console.log("Visa verified, extracted age:", extractedAgeFromVisa);

                // --- Step 2: Finalize Booking ---
                try {
                    console.log("Finalizing booking...");
                    setMessage('Confirming your Booking...'); // Update message
                    setMessageType('info');

                    // Pass the original pendingBooking data received from Seats.js
                    // This object *must* contain flight_id, seat_number, user_id etc.
                    // required by the backend finalize endpoint.
                    const bookResponse = await axios.post(FINALIZE_BOOKING_ENDPOINT, pendingBooking, {
                        timeout: 15000 // Timeout for booking call
                    });

                    // --- Booking Finalization Success ---
                    if (bookResponse.data.status === 'success') {
                        setIsBooking(false); // Booking finished

                        // ** SUCCESS: Navigate to Insurance **
                        setMessage('✅ Booking confirmed! Proceeding to insurance options...');
                        setMessageType('success');
                        console.log("Booking finalized, navigating to insurance.");
                        setTimeout(() => {
                            // Pass updated user (with age) and original pendingBooking
                            navigate('/insurance', { state: { user: updatedUser, pendingBooking } });
                        }, 1500); // Delay to show message

                    } else {
                        // Booking failed (e.g., seat taken server-side)
                        setIsBooking(false);
                        setMessage(`⚠️ Booking failed: ${bookResponse.data.message || 'Could not finalize booking (seat might be taken).'}`);
                        setMessageType('error');
                        // Do NOT navigate to insurance
                    }
                } catch (bookError) {
                    // Network or server error during booking call
                    setIsBooking(false);
                    console.error("Booking error:", bookError.response?.data || bookError.message);
                    let bookErrMsg = 'Server error during booking attempt.';
                    if (bookError.code === 'ECONNABORTED') bookErrMsg = "Booking request timed out.";
                    else if (bookError.response) bookErrMsg = bookError.response.data?.message || `Booking failed (Status: ${bookError.response.status}, seat might be taken?)`;
                    else bookErrMsg = "Booking failed (Network Error).";
                    setMessage(`⚠️ Booking process failed: ${bookErrMsg}`);
                    setMessageType('error');
                    // Do NOT navigate to insurance
                }
                // --- End Step 2 ---

            } else {
                // --- Visa Verification Failed ---
                setIsVerifying(false);
                setMessage(`❌ Visa verification failed: ${verifyResponse.data.message || 'Details mismatch or document unclear.'}`);
                setMessageType('error');
                // Do NOT proceed to booking or insurance
            }
        } catch (verifyError) {
            // --- Network or Server Error during Verification ---
            // Ensure both states are reset on outer error
            setIsVerifying(false);
            setIsBooking(false);
            console.error("Verification error:", verifyError.response?.data || verifyError.message);
            let specificError = 'Server error during verification.';
             if (verifyError.code === 'ECONNABORTED') specificError = 'Verification request timed out.';
             else if (verifyError.response) specificError = verifyError.response.data?.message || `Verification failed (Status: ${verifyError.response.status})`;
             else specificError = 'Verification failed (Network Error).';
            setMessage(`❌ Verification process failed: ${specificError}`);
            setMessageType('error');
             // Do NOT proceed to booking or insurance
        }
    }; // --- End handleUploadAndBook ---

    // Derived loading state includes both verification and booking
    const isLoading = isVerifying || isBooking || quizIncorrectFlash;

    // Early return if essential data is missing
    if (!user || !pendingBooking || !user.phoneNumber) {
        return (
            <div className="upload-visa-page">
                <div className="upload-visa-content-box">
                    <p className="upload-visa-error-message">
                        ❌ Error: Missing user (incl. phone) or booking information. Please navigate back and select a flight/seat again.
                    </p>
                    {/* Try to preserve user state if possible when going back */}
                    <button onClick={() => navigate('/flights', { state: { user: user || undefined } })} className="upload-visa-button go-home">Go to Flights</button>
                </div>
            </div>
        );
    }

    // --- Render Component ---
    return (
        <div className="upload-visa-page">
            <div className="upload-visa-content-box">

                {/* --- Quiz Section --- */}
                {!quizPassed && currentQuestion && (
                    <div className="upload-visa-quiz-container">
                        <h3>Food Trivia Challenge!</h3>
                        <p className="upload-visa-quiz-question">{currentQuestion.q}</p>
                        <div className={`upload-visa-quiz-options ${quizIncorrectFlash ? 'incorrect-flash' : ''}`}>
                            {iconEntries.map(([key, iconPath]) => (
                                <button
                                    key={key}
                                    className="upload-visa-country-icon-button"
                                    onClick={() => handleQuizAnswer(key)}
                                    disabled={isLoading}
                                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                                >
                                    <img src={iconPath} alt={key} />
                                </button>
                            ))}
                        </div>
                         {message && messageType === 'error' && quizIncorrectFlash && (
                            <p className={`upload-visa-message ${messageType}`}>
                                {message}
                            </p>
                         )}
                    </div>
                )}

                {/* --- Visa Upload & Booking Section --- */}
                {quizPassed && (
                    <div className="upload-visa-form-container">
                        <h2>Upload Visa & Finalize Booking</h2>
                        <p>Upload your visa for verification. If verified, we will confirm your seat booking before proceeding.</p>
                        <p className="upload-visa-booking-details">
                            <strong>Flight:</strong> {pendingBooking.airline || 'N/A'} | {pendingBooking.origin || 'N/A'} ➜ {pendingBooking.destination || 'N/A'} <br />
                            <strong>Seat:</strong> {pendingBooking.seat_number || 'N/A'}
                        </p>
                        <p className="upload-visa-instruction">
                            <i> Ensure your Name ({user.name || 'N/A'}), Email ({user.email || 'N/A'}), Company ({user.company?.name || 'N/A'}), Phone ({user.phoneNumber || 'N/A'}), Destination ({pendingBooking.destination || 'N/A'}), and Age match the visa document. </i>
                        </p>

                        <form onSubmit={handleUploadAndBook} className="upload-visa-form">
                             <label htmlFor="visa-upload" className="upload-visa-file-label"> Choose Visa File (Image or PDF): </label>
                             <input
                                 id="visa-upload"
                                 className="upload-visa-file-input"
                                 type="file"
                                 onChange={handleFileChange}
                                 accept="image/*,.pdf"
                                 required
                                 disabled={isLoading}
                             />
                             {visaFile && <span className="upload-visa-filename">{visaFile.name}</span>}

                             <button
                                 type="submit"
                                 className="upload-visa-button submit"
                                 disabled={!visaFile || isLoading}
                             >
                                 {/* Dynamic button text */}
                                 {isVerifying ? 'Verifying Visa...' : isBooking ? 'Finalizing Booking...' : 'Verify & Book Seat'}
                             </button>
                         </form>
                    </div>
                )}

                {/* --- General Message Area --- */}
                 {message && (messageType !== 'error' || !quizIncorrectFlash) && (
                    <p className={`upload-visa-message ${messageType}`}>
                        {message}
                    </p>
                 )}

                {/* --- Back Button --- */}
                 <button
                     onClick={() => navigate(-1)}
                     disabled={isLoading}
                     className="upload-visa-button back"
                 >
                     🔙 Go Back
                 </button>
            </div>
        </div>
    );
}

export default UploadVisa;