import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Locations.css'; // Ensure CSS is linked

// --- Constants ---
const IMAGE_PATH = '/images/';
const BEAR_NORMAL_SRC = IMAGE_PATH + 'bear.png';
const BEAR_SCARY_SRC = IMAGE_PATH + 'bear(1).png';
const TREE_SRC = IMAGE_PATH + 'tree_PNG2517.png';
const AXE_SRC = IMAGE_PATH + 'axe.png';
const WOOD_PILE_SRC = IMAGE_PATH + 'wood.png';
const FLINT_SRC = IMAGE_PATH + 'stone.png';
const CAMPFIRE_SRC = IMAGE_PATH + 'bonfire.png';

const MAX_BEAR_SIZE = 250; // Pixels - Triggers scare
const INITIAL_BEAR_SIZE = 50;
const BEAR_GROWTH_RATE = 1.2; // Faster rate
const BEAR_GROWTH_INTERVAL = 100;
const CAMPFIRE_SHRINK_AMOUNT = 50; // Unused currently
const TREE_HEALTH = 6; // Number of hits to chop
const CUT_TREE_INTERVAL = 400; // ms between hover cuts

// --- Date Restriction Constants ---
const BASIC_MIN_DAYS_AHEAD = 3;
const PREMIUM_MIN_DAYS_AHEAD = 1;
const MAX_DAYS_AHEAD = 90;

// --- Helper Functions ---
const getRandom = (min, max) => Math.random() * (max - min) + min;

// Function to format date as YYYY-MM-DD
const formatDate = (date) => {
  if (!(date instanceof Date) || isNaN(date)) {
    // console.error("Invalid date passed to formatDate:", date);
    return ''; // Return empty string for invalid dates
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper: Format FULL DateTime string for display (expects ISO string like YYYY-MM-DDTHH:MM:SS)
const formatDisplayDateTime = (dateTimeString) => {
    if (!dateTimeString) return 'N/A';
    try {
        const date = new Date(dateTimeString);
        if (isNaN(date)) throw new Error("Invalid Date object"); // Check if Date object is valid
        // Example: "Apr 10, 2025, 08:00"
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false // Use 24-hour format
        });
    } catch (e) {
        console.error("Error formatting display date:", dateTimeString, e);
        return dateTimeString; // Fallback
    }
};
// --- End Helpers ---

function Locations() {
  // --- State ---
  const location = useLocation();
  const navigate = useNavigate();
  // Receive airline, flights, and user from previous route (Flights)
  const { airline, flights, user } = location.state || {};
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originsList, setOriginsList] = useState([]);
  const [destinationsList, setDestinationsList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD string
  const [dateError, setDateError] = useState('');

  // State to hold the flight *schedule* matching origin/dest
  const [selectedFlightDetails, setSelectedFlightDetails] = useState(null);
  const [routeError, setRouteError] = useState(''); // Error for route existence

  // --- Game State ---
  const [bear, setBear] = useState({ size: INITIAL_BEAR_SIZE, src: BEAR_NORMAL_SRC, isFading: false });
  const [tree, setTree] = useState({ health: TREE_HEALTH, chopped: false, isHit: false });
  const [woodPile, setWoodPile] = useState({ exists: false, isLit: false });
  const [activeTool, setActiveTool] = useState(null);
  const [canCutTree, setCanCutTree] = useState(true);
  const [isReloading, setIsReloading] = useState(false);

  // Refs
  const containerRef = useRef(null);
  const bearIntervalRef = useRef(null);
  const treeHitTimeoutRef = useRef(null);
  const cutThrottleTimeoutRef = useRef(null);

  // --- Get Company Status ---
  const companyStatus = user?.company?.status || 'basic';

  // --- Calculate Date Restrictions using useMemo ---
  const { minBookingDate, maxBookingDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDays = companyStatus === 'premium' ? PREMIUM_MIN_DAYS_AHEAD : BASIC_MIN_DAYS_AHEAD;
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + minDays);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + MAX_DAYS_AHEAD);
    return {
      minBookingDate: formatDate(minDate),
      maxBookingDate: formatDate(maxDate),
    };
  }, [companyStatus]);

  // --- Effects ---

  // Effect 1: Populate Origins List
  useEffect(() => {
    if (flights && Array.isArray(flights)) {
      const uniqueOrigins = [...new Set(flights.map(f => f.origin))].sort();
      setOriginsList(uniqueOrigins);
    } else {
      console.warn("Locations: Flights data missing or not an array.", flights);
      setOriginsList([]);
    }
    // Reset dependent state
    setOrigin('');
    setDestination('');
    setDestinationsList([]);
    setSelectedDate('');
    setSelectedFlightDetails(null);
    setRouteError('');
    setDateError('');
  }, [flights]); // Dependency: flights array

  // Effect 2: Update Destinations List when Origin changes
  useEffect(() => {
    if (origin && flights && Array.isArray(flights)) {
      const availableDestinations = flights
        .filter(f => f.origin === origin)
        .map(f => f.destination);
      const uniqueDestinations = [...new Set(availableDestinations)].sort();
      setDestinationsList(uniqueDestinations);
    } else {
      setDestinationsList([]);
    }
    // Reset downstream state
    setDestination('');
    setSelectedFlightDetails(null);
    setRouteError('');
  }, [origin, flights]); // Dependencies: origin, flights

  // Effect 3: Find matching flight *schedule* when origin AND destination are selected
  useEffect(() => {
    setSelectedFlightDetails(null);
    setRouteError('');
    if (origin && destination && flights && Array.isArray(flights)) {
        const matchingFlightSchedule = flights.find(f =>
            f.origin === origin &&
            f.destination === destination
        );
        if (matchingFlightSchedule) {
            setSelectedFlightDetails(matchingFlightSchedule);
        } else {
            setRouteError(`No scheduled flights found for the route ${origin} to ${destination}.`);
        }
    }
  }, [origin, destination, flights]); // Dependencies: origin, destination, flights

  // Effect 4: Validate Date Separately (Weekend check)
  useEffect(() => {
      setDateError('');
      if (selectedDate && companyStatus === 'basic') {
          const dateObj = new Date(selectedDate + 'T00:00:00');
          if (isNaN(dateObj)) { setDateError('Invalid date selected.'); return; }
          const dayOfWeek = dateObj.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) { setDateError('Weekend bookings are only available for premium companies. Please select a weekday.'); }
      }
  }, [selectedDate, companyStatus]); // Dependencies: selectedDate, companyStatus


  // --- Game Logic Effects ---
  useEffect(() => { // Bear Growing Logic
    const startBearGrowth = () => {
      if (bearIntervalRef.current) clearInterval(bearIntervalRef.current);
      bearIntervalRef.current = setInterval(() => {
        setBear((prevBear) => {
          if (prevBear.isFading || prevBear.src === BEAR_SCARY_SRC || woodPile.isLit) { if (bearIntervalRef.current) clearInterval(bearIntervalRef.current); return prevBear; }
          const newSize = prevBear.size + BEAR_GROWTH_RATE;
          if (newSize >= MAX_BEAR_SIZE) { if (bearIntervalRef.current) clearInterval(bearIntervalRef.current); console.log("BEAR SCARED!"); return { ...prevBear, size: MAX_BEAR_SIZE, src: BEAR_SCARY_SRC, isFading: false }; }
          return { ...prevBear, size: newSize };
        });
      }, BEAR_GROWTH_INTERVAL);
    };
    if (!woodPile.isLit && !bear.isFading && bear.src !== BEAR_SCARY_SRC) { startBearGrowth(); }
    else { if (bearIntervalRef.current) clearInterval(bearIntervalRef.current); }
    return () => { if (bearIntervalRef.current) clearInterval(bearIntervalRef.current); };
  }, [woodPile.isLit, bear.isFading, bear.src]); // Dependencies: game state

  useEffect(() => { // Reload on Scare
    let timer;
    if (bear.src === BEAR_SCARY_SRC && !isReloading) {
      setIsReloading(true);
      timer = setTimeout(() => { alert("The bear got too close!"); window.location.reload(); }, 1500);
    }
    return () => clearTimeout(timer);
  }, [bear.src, isReloading]); // Dependencies: game state

  useEffect(() => { // Cleanup other timeouts on unmount
    return () => { if (treeHitTimeoutRef.current) clearTimeout(treeHitTimeoutRef.current); if (cutThrottleTimeoutRef.current) clearTimeout(cutThrottleTimeoutRef.current); };
  }, []); // Empty: runs only on unmount

  // --- Callbacks ---
  const cutTreeAction = useCallback(() => {
    if (tree.chopped || !canCutTree) return;
    setCanCutTree(false); setTree(prev => ({ ...prev, isHit: true }));
    if (treeHitTimeoutRef.current) clearTimeout(treeHitTimeoutRef.current);
    treeHitTimeoutRef.current = setTimeout(() => setTree(prev => ({ ...prev, isHit: false })), 300);
    setTree(prevTree => {
      const newHealth = Math.max(0, prevTree.health - 1);
      if (newHealth <= 0 && !prevTree.chopped) { setWoodPile(prevPile => ({ ...prevPile, exists: true, isLit: false })); setActiveTool(null); return { ...prevTree, health: 0, chopped: true }; }
      return { ...prevTree, health: newHealth };
    });
    cutThrottleTimeoutRef.current = setTimeout(() => { setCanCutTree(true); }, CUT_TREE_INTERVAL);
  // Dependencies: Include state and setters used inside
  }, [tree.chopped, tree.health, canCutTree, setCanCutTree, setTree, setWoodPile, setActiveTool]);

  const handleToolClick = useCallback((toolType, event) => {
    event.stopPropagation(); setActiveTool(prevTool => (prevTool === toolType ? null : toolType));
  }, [setActiveTool]); // Dependency: Only the setter function

  const handleTreeClick = useCallback((event) => {
    event.stopPropagation(); if (activeTool === 'axe' && !tree.chopped && tree.health > 0 && canCutTree) { cutTreeAction(); }
  // Dependencies: Include state and functions used inside
  }, [activeTool, tree.chopped, tree.health, canCutTree, cutTreeAction]);

  const handleWoodPileClick = useCallback((event) => {
    event.stopPropagation(); if (activeTool === 'flint' && woodPile.exists && !woodPile.isLit) { setWoodPile(prev => ({ ...prev, isLit: true })); if (bearIntervalRef.current) clearInterval(bearIntervalRef.current); setBear(prev => ({ ...prev, isFading: true })); setActiveTool(null); }
  // Dependencies: Include state and setters used inside
  }, [activeTool, woodPile.exists, woodPile.isLit, setWoodPile, setBear, setActiveTool]);

  const handleBackgroundClick = useCallback(() => {
    if (activeTool) { setActiveTool(null); }
  }, [activeTool, setActiveTool]); // Dependencies: Include state and setters used inside


  // --- UI Logic ---
  const handleDateChange = (e) => {
    setSelectedDate(e.target.value); // Set the YYYY-MM-DD string
  };

  // *** CALCULATE ISO DATETIME STRINGS using useMemo ***
    // *** CALCULATE ISO DATETIME STRINGS using useMemo ***
    const { departureDateTime, arrivalDateTime } = useMemo(() => {
      let depISO = null;
      let arrISO = null;

      // Helper function to parse and format time string (handles H:MM, HH:MM, H:MM:SS, HH:MM:SS)
      const parseAndFormatTime = (timeStr) => {
          if (!timeStr || typeof timeStr !== 'string') return null;

          const parts = timeStr.split(':');
          if (parts.length < 2 || parts.length > 3) {
              console.warn("Invalid time format (needs HH:MM or HH:MM:SS):", timeStr);
              return null; // Expect HH:MM or HH:MM:SS
          }

          let [hour, minute, second] = parts;

          // Validate parts look like numbers
          if (isNaN(parseInt(hour)) || isNaN(parseInt(minute)) || (parts.length === 3 && isNaN(parseInt(second)))) {
              console.warn("Invalid time components (not numbers):", timeStr);
              return null;
          }

          // Pad hour and minute if necessary
          const paddedHour = String(hour).padStart(2, '0');
          const paddedMinute = String(minute).padStart(2, '0');
          // Default seconds to '00' if not provided or pad existing seconds
          const paddedSecond = parts.length === 3 ? String(second).padStart(2, '0') : '00';

          // Basic range validation
          const hourNum = parseInt(paddedHour);
          const minNum = parseInt(paddedMinute);
          const secNum = parseInt(paddedSecond);
          if (hourNum < 0 || hourNum > 23 || minNum < 0 || minNum > 59 || secNum < 0 || secNum > 59) {
               console.warn("Invalid time value out of range:", `${paddedHour}:${paddedMinute}:${paddedSecond}`);
               return null; // Invalid time range
          }

          // Return consistently formatted HH:MM:SS
          return `${paddedHour}:${paddedMinute}:${paddedSecond}`;
      };


      // Only calculate if we have the necessary details and no date error
      if (selectedFlightDetails && selectedDate && !dateError && !routeError) {
          const depTimeInput = selectedFlightDetails.departure_time; // e.g., "08:00:00", "8:00", "9:30:15"
          const arrTimeInput = selectedFlightDetails.arrival_time;   // e.g., "10:30:00", "02:00:00"

          const formattedDepTime = parseAndFormatTime(depTimeInput); // Returns "HH:MM:SS" or null
          const formattedArrTime = parseAndFormatTime(arrTimeInput); // Returns "HH:MM:SS" or null

          if (formattedDepTime) {
              depISO = `${selectedDate}T${formattedDepTime}`;
          } else if (depTimeInput) { // Log warning only if input existed but parsing failed
              console.warn("Could not parse departure time:", depTimeInput);
          }

          if (formattedArrTime) {
              let arrivalDateStr = selectedDate;

              // Check for overnight flight: Compare formatted times (guaranteed HH:MM:SS)
              // This check is reliable now because both times are in the same padded format.
              if (formattedDepTime && formattedArrTime < formattedDepTime) {
                  try {
                      // Calculate next day's date string
                      const departureDateObj = new Date(selectedDate + 'T00:00:00Z'); // Use Z for UTC base to avoid DST issues in calculation
                      if(isNaN(departureDateObj)) throw new Error("Invalid start date for arrival calculation");
                      departureDateObj.setUTCDate(departureDateObj.getUTCDate() + 1); // Increment UTC date
                      arrivalDateStr = departureDateObj.toISOString().substring(0, 10); // Get YYYY-MM-DD part
                  } catch(e) {
                      console.error("Error calculating next day arrival date:", e);
                      // Fallback to original selected date if calculation fails
                      arrivalDateStr = selectedDate;
                  }
              }
              arrISO = `${arrivalDateStr}T${formattedArrTime}`;
          } else if (arrTimeInput) { // Log warning only if input existed but parsing failed
              console.warn("Could not parse arrival time:", arrTimeInput);
          }
      }

      // Make sure formatDate can handle the potentially recalculated arrivalDateStr
      // (Note: formatDate is already defined outside and seems robust)

      return { departureDateTime: depISO, arrivalDateTime: arrISO };
  // Dependencies for recalculation
  }, [selectedFlightDetails, selectedDate, dateError, routeError]); // Removed formatDate from deps as it's stable
  // **********************************************************

  const handleProceed = () => {
    // Add check for user existence FIRST
    if (!user) {
        console.error("Cannot proceed: User data missing.");
        setRouteError("User data missing, cannot proceed."); // Use routeError state for feedback
        return;
    }
    // Proceed only if flight details, date are valid, AND ISO datetimes were calculable
    if (selectedFlightDetails && selectedDate && !dateError && !routeError && departureDateTime && arrivalDateTime) {
      console.log(`Proceeding to seats for flight ${selectedFlightDetails.id} (${origin}-${destination}) on ${selectedDate}`);
      // ***** PASS THE DATA TO '/seats' *****
      navigate('/seats', {
          state: {
              airline, // Keep existing state (might be redundant if in flightDetails)
              flightDetails: selectedFlightDetails, // The specific flight schedule object
              selectedDate, // The "YYYY-MM-DD" date string
              departureDateTime: departureDateTime, // Calculated ISO departure string
              arrivalDateTime: arrivalDateTime,     // Calculated ISO arrival string
              user: user // *** Pass the complete user object ***
          }
      });
      // **************************************
    } else {
        // Provide more specific feedback
        let alertMsg = "Please ensure a valid route and date are selected.";
        if (!user) { // Should be caught above, but as fallback
            alertMsg = "User information is missing. Please log in again.";
        } else if (!selectedFlightDetails || !selectedDate || !!dateError || !!routeError) {
             alertMsg = "Please select a valid route and date first.";
        } else if (!departureDateTime || !arrivalDateTime) {
            alertMsg = "Could not determine exact flight times from the schedule. Please check flight details or try again.";
            console.error("Proceed blocked: Could not calculate valid ISO datetimes.", { departureDateTime, arrivalDateTime });
        }
      alert(alertMsg);
    }
  };

  const handleBack = () => navigate(-1);

  // Determine if proceed button should be disabled
  // Ensure user exists AND all necessary flight/date info is valid AND times calculated
  const proceedDisabled = !user || !selectedFlightDetails || !selectedDate || !!dateError || !!routeError || !departureDateTime || !arrivalDateTime;


  // --- Render ---
  if (isReloading) {
    return ( <div className="locations-page-wrapper reloading-notice"> <img src={BEAR_SCARY_SRC} alt="Scared!" style={{width: `${MAX_BEAR_SIZE}px`, position: 'absolute', bottom: '2%', right: '5%', transform: 'translateX(50%)', zIndex: 10}}/> <p>The bear got too close... reloading!</p> </div> );
  }
  // Check for user *before* trying to access user.company
  if (!user) {
     return ( <div className="locations-page-wrapper error-notice"> <p>Error: User data not loaded. Please log in again.</p> <button onClick={() => navigate('/')} className="locations-button go-home">Go Home</button> </div> );
   }
   // Now safe to check user.company - show error if company info specifically is missing
   if (!user.company) {
      return ( <div className="locations-page-wrapper error-notice"> <p>Error: Company data not loaded correctly for the user.</p> <button onClick={() => navigate('/')} className="locations-button go-home">Go Home</button> </div> );
    }

  // Use calculated ISO strings for the display formatter
  const displayDeparture = formatDisplayDateTime(departureDateTime);
  const displayArrival = formatDisplayDateTime(arrivalDateTime);

  // Main component render
  return (
    <div
      className={`locations-page-wrapper ${activeTool ? `tool-active-${activeTool}` : ''}`}
      ref={containerRef}
      onClick={handleBackgroundClick} // Handle clicks on the background to deactivate tools
    >
      {/* --- Camping Elements Container --- */}
      <div className="camping-elements-container">
          {/* Bear Image */}
          <img src={bear.src} alt="Bear" className={`bear ${bear.isFading ? 'fading' : ''}`} style={{ width: `${bear.size}px` }} />
          {/* Tree Container */}
          {!tree.chopped && (
            <div className={`tree-container ${activeTool === 'axe' ? 'choppable' : ''} ${tree.isHit ? 'hit' : ''}`} onClick={handleTreeClick}>
              <img src={TREE_SRC} alt="Tree" className="tree-image" style={{ opacity: tree.health > 0 ? 0.4 + (tree.health / TREE_HEALTH) * 0.6 : 0.4 }}/>
              {tree.health < TREE_HEALTH && tree.health > 0 && (
                  <div className="tree-health-bar-container">
                    <div className="tree-health-bar-inner" style={{ width: `${(tree.health / TREE_HEALTH) * 100}%` }}></div>
                  </div>
              )}
            </div>
           )}
          {/* Wood Pile Image */}
          {woodPile.exists && !woodPile.isLit && ( <img src={WOOD_PILE_SRC} alt="Wood Pile" className={`wood-pile ${activeTool === 'flint' ? 'lightable' : ''}`} onClick={handleWoodPileClick} /> )}
          {/* Campfire Image */}
          {woodPile.isLit && ( <img src={CAMPFIRE_SRC} alt="Campfire" className="campfire lit" /> )}
          {/* Tools Area */}
          <div className="tools-area">
            <img src={AXE_SRC} alt="Axe" className={`tool axe ${activeTool === 'axe' ? 'active' : ''}`} onClick={(e) => handleToolClick('axe', e)} />
            <img src={FLINT_SRC} alt="Flint" className={`tool flint ${activeTool === 'flint' ? 'active' : ''}`} onClick={(e) => handleToolClick('flint', e)} />
          </div>
      </div>
      {/* --- End Camping Elements --- */}


      {/* --- UI Overlay --- */}
      <div className="locations-ui-overlay">
         {/* Display Company Status */}
         <p className="company-status-indicator"> Company Plan: <span className={companyStatus}>{companyStatus.toUpperCase()}</span> </p>
         {/* Main Heading */}
         <h3>Select Route from <strong>{airline || 'Selected Airline'}</strong></h3>
         {/* Back Button */}
         <button onClick={handleBack} className="locations-button back">🔙 Change Airline</button>

         {/* Group for Location and Date Selectors */}
         <div className="location-selectors-group">
             {/* Location Selectors Row */}
             <div className="location-selectors">
                {/* Origin Selector */}
                <div className="select-group">
                  <label htmlFor="origin-select">Origin:</label>
                  <select id="origin-select" value={origin} onChange={(e) => setOrigin(e.target.value)} required>
                    <option value="">-- Select Origin --</option>
                    {originsList.map((loc) => (<option key={`orig-${loc}`} value={loc}>{loc}</option>))}
                  </select>
                </div>

                {/* Destination Selector (Dynamic) */}
                <div className="select-group">
                  <label htmlFor="dest-select">Destination:</label>
                  <select id="dest-select" value={destination} onChange={(e) => setDestination(e.target.value)} required disabled={!origin || destinationsList.length === 0} >
                    <option value="">-- Select Destination --</option>
                    {destinationsList.map((loc) => (<option key={`dest-${loc}`} value={loc}>{loc}</option>))}
                  </select>
                   {!origin && <small className="info-message small">Select origin first</small>}
                   {origin && destinationsList.length === 0 && <small className="error-message small">No destinations from {origin}</small>}
                </div>
             </div>

             {/* Date Selector Group */}
              <div className="select-group date-selector">
                 <label htmlFor="date-select">Travel Date:</label>
                 <input
                    type="date"
                    id="date-select"
                    value={selectedDate}
                    onChange={handleDateChange}
                    min={minBookingDate}
                    max={maxBookingDate}
                    required
                    disabled={!origin || !destination} // Disable until route is selected
                 />
                 {companyStatus === 'basic' && (<small className="date-restriction-info">Weekends unavailable for Basic plan.</small>)}
                 {/* Display validation error messages */}
                 {dateError && <p className="error-message date-error">{dateError}</p>}
                 {routeError && <p className="error-message route-error">{routeError}</p>}
              </div>
             {/* --- End Date Selector --- */}
         </div>
         {/* --- End Group --- */}

         {/* --- Display Selected Flight Times --- */}
         {selectedFlightDetails && selectedDate && !dateError && !routeError && (
             <div className="selected-flight-details">
                 <h4>Flight Details for {selectedDate}:</h4>
                 {/* Use display formatted times */}
                 <p><strong>Departure:</strong> {displayDeparture}</p>
                 <p><strong>Arrival:</strong> {displayArrival}</p>
                 <p><strong>Price:</strong> ${selectedFlightDetails.price?.toFixed(2)}</p>
                 {/* Note about potential next day arrival */}
                 {/* Check if arrival ISO date is later than departure ISO date */}
                 {arrivalDateTime && departureDateTime && arrivalDateTime.substring(0, 10) > departureDateTime.substring(0, 10) && (
                     <small className="info-message small">(Arrival on next calendar day)</small>
                 )}
                 {/* Warning if times couldn't be calculated */}
                 {(displayDeparture === 'N/A' || displayArrival === 'N/A') && !routeError && <p className="error-message small">Could not calculate exact flight times.</p>}
             </div>
         )}
         {/* --- End Flight Details Display --- */}


         {/* Proceed Button */}
         <button
            onClick={handleProceed}
            disabled={proceedDisabled} // Use updated condition
            className="locations-button proceed"
         >
           Continue to Seat Selection →
         </button>
         {/* Informational message when button is disabled */}
         {proceedDisabled && !user && <p className="info-message">User data missing.</p>}
         {proceedDisabled && user && (!selectedFlightDetails || !selectedDate || !!dateError || !!routeError) && <p className="info-message">Please select a valid route and date.</p>}
         {proceedDisabled && user && selectedFlightDetails && selectedDate && !dateError && !routeError && (!departureDateTime || !arrivalDateTime) && <p className="info-message">Flight time calculation pending or failed.</p>}
      </div>
      {/* --- End UI Overlay --- */}
    </div>
  );
}

export default Locations;