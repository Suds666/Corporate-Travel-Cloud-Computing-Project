import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Seats.css';

// --- Constants ---
const IMAGE_SOURCES = [
  '/images/man-standing-up-with-arms-in-front.png',
  '/images/person.png',
  '/images/man-standing-up.png',
  '/images/standing-man-silhouette-holding-a-disc.png',
];
const GAME_QUEUE_TARGET = 6;
const MIN_SPAWN_DELAY = 1800;
const MAX_SPAWN_DELAY = 4000;
const MIN_FALL_DURATION = 1000;
const MAX_FALL_DURATION = 3000;

function Seats() {
  const location = useLocation();
  const navigate = useNavigate();

  // --- MODIFIED: Read 'flightDetails', 'selectedDate', etc. from location.state ---
  const {
    user,
    flightDetails,
    selectedDate,
    departureDateTime, // ISO string from Locations.js state
    arrivalDateTime,   // ISO string from Locations.js state
    // airline, origin, destination are likely available within flightDetails
  } = location.state || {};

  // Derive necessary info primarily from flightDetails for robustness
  const flightOrigin = flightDetails?.origin;
  const flightDestination = flightDetails?.destination;
  const flightAirline = flightDetails?.airline;

  const [selectedSeat, setSelectedSeat] = useState(null);

  // --- Game State ---
  const [fallingItems, setFallingItems] = useState([]);
  const [appearanceOrder, setAppearanceOrder] = useState([]);
  const [correctlyQueued, setCorrectlyQueued] = useState([]);
  const [isDraggingOverQueue, setIsDraggingOverQueue] = useState(false);
  const [incorrectDropFlash, setIncorrectDropFlash] = useState(false);
  const [hasUserStartedGame, setHasUserStartedGame] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const [hasGameBeenWon, setHasGameBeenWon] = useState(false);

  const nextItemId = useRef(0);
  const spawnTimeoutRef = useRef(null);

  // --- Spawn Logic ---
  const spawnItem = useCallback(() => {
    if (!isGameActive || hasGameBeenWon || fallingItems.length > 15) {
      clearTimeout(spawnTimeoutRef.current);
      return;
    }

    const id = nextItemId.current++;
    const src = IMAGE_SOURCES[Math.floor(Math.random() * IMAGE_SOURCES.length)];
    const duration = Math.random() * (MAX_FALL_DURATION - MIN_FALL_DURATION) + MIN_FALL_DURATION;
    const left = Math.random() * 95; // Percentage from left

    const newItem = { id, src, duration, left, startTime: Date.now() };
    setFallingItems(prev => [...prev, newItem]);

    // Only track appearance order if the game isn't won yet
    if (correctlyQueued.length < GAME_QUEUE_TARGET) {
      setAppearanceOrder(prev => [...prev, id]);
    }

    // Schedule removal of the item after its animation duration
    setTimeout(() => {
      setFallingItems(prev => prev.filter(item => item.id !== id));
    }, duration);

    // Schedule next spawn ONLY if game should still be running
    if (isGameActive && !hasGameBeenWon) {
        const nextDelay = Math.random() * (MAX_SPAWN_DELAY - MIN_SPAWN_DELAY) + MIN_SPAWN_DELAY;
        clearTimeout(spawnTimeoutRef.current); // Clear previous before setting new
        spawnTimeoutRef.current = setTimeout(spawnItem, nextDelay);
    } else {
         clearTimeout(spawnTimeoutRef.current); // Ensure clear if game stopped/won
    }
  }, [fallingItems.length, correctlyQueued.length, isGameActive, hasGameBeenWon]); // Dependencies

  // --- Effect to Start/Stop Spawning based on game state ---
  useEffect(() => {
    if (isGameActive && !hasGameBeenWon) {
      clearTimeout(spawnTimeoutRef.current); // Clear residual timer
      spawnTimeoutRef.current = setTimeout(spawnItem, MIN_SPAWN_DELAY); // Start spawning
      // console.log("Game Active: Starting spawn loop.");
    } else {
      clearTimeout(spawnTimeoutRef.current); // Stop spawning if inactive or won
      // console.log("Game Inactive or Won: Clearing spawn loop.");
    }

    // Cleanup function: clear timeout on unmount or dependency change
    return () => {
      // console.log("Effect cleanup: Clearing timeout.");
      clearTimeout(spawnTimeoutRef.current);
    };
  }, [isGameActive, hasGameBeenWon, spawnItem]); // spawnItem included as it's called

  // --- Game Control Functions ---
  const startGame = () => {
    // Check necessary data exists before starting
    if (!user || !flightDetails || hasUserStartedGame) return;

    console.log("Starting Game...");
    setCorrectlyQueued([]);
    setAppearanceOrder([]);
    setFallingItems([]); // Clear any previous items
    setHasGameBeenWon(false);
    setIncorrectDropFlash(false);
    nextItemId.current = 0;

    // Set flags - the useEffect above will react to isGameActive change
    setHasUserStartedGame(true);
    setIsGameActive(true);
  };

  const handleDragStart = useCallback((e, id, src) => {
    if (!isGameActive || hasGameBeenWon) {
      e.preventDefault();
      return;
    }
    // Use try-catch for robustness, though JSON.stringify rarely fails here
    try {
        e.dataTransfer.setData("application/json", JSON.stringify({ id, src }));
        e.dataTransfer.effectAllowed = "move"; // Indicate intention
        if (e.target) e.target.style.opacity = 0.5; // Dim the dragged item
    } catch (error) {
        console.error("Error setting drag data:", error);
    }
  }, [isGameActive, hasGameBeenWon]);

  const handleDragEnd = (e) => {
    // Reset opacity if the target element still exists
    if (e.target && typeof e.target.style !== 'undefined') { // Check if style exists
         e.target.style.opacity = 1;
    }
  };

  const handleDragOver = (e) => {
    // Allow drop only if game is active and not won
    if (isGameActive && !hasGameBeenWon) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move"; // Indicate valid drop zone
        setIsDraggingOverQueue(true); // Visual feedback
    }
  };

  const handleDragLeave = () => {
    setIsDraggingOverQueue(false); // Remove visual feedback
  };

  const handleDrop = (e) => {
    if (!isGameActive || hasGameBeenWon) return; // Prevent drop if game not active/won

    e.preventDefault(); // Prevent default browser behavior
    setIsDraggingOverQueue(false);
    setIncorrectDropFlash(false); // Reset any previous flash

    let data;
    try {
        data = JSON.parse(e.dataTransfer.getData("application/json"));
        // Basic validation of parsed data
        if (!data || typeof data.id === 'undefined' || typeof data.src === 'undefined') {
            throw new Error("Invalid data format received from drop.");
        }
    } catch (error) {
        console.error("Failed to parse or validate drag data:", error);
        return; // Exit if data is invalid
    }

    const { id, src } = data;
    const expectedId = appearanceOrder[correctlyQueued.length];

    // Check if the dropped item ID matches the next expected ID in the sequence
    if (correctlyQueued.length >= appearanceOrder.length || id !== expectedId) {
      console.log(`Incorrect Drop! Expected: ${expectedId}, Got: ${id}`);
      setIncorrectDropFlash(true);
      setIsGameActive(false); // Stop game logic & spawning (useEffect handles timeout clear)

      // Reload the page after a short delay to reset the game/page state
      setTimeout(() => {
        window.location.reload();
      }, 500); // 0.5 second delay

    } else {
      console.log("Correct Drop!");
      // Add to the correctly queued list
      setCorrectlyQueued(prev => {
        const updated = [...prev, { id, src }];
        // Check for win condition
        if (updated.length === GAME_QUEUE_TARGET) {
          console.log("Game Won!");
          // Mark as won and inactive (useEffect handles stopping spawns)
          setIsGameActive(false);
          setHasGameBeenWon(true);
          setFallingItems([]); // Clear remaining falling items immediately
        }
        return updated;
      });
      // Remove the correctly dropped item from the falling list
      setFallingItems(prev => prev.filter(item => item.id !== id));
    }
  };

  // --- Render Logic ---

  // Initial checks for essential data
  if (!user) return <p className="seats-pg-error-message">❌ Error: User not found.</p>;
  // MODIFIED Check for flightDetails (object) instead of flights (array)
  if (!flightDetails) return <p className="seats-pg-warning-message">⚠️ No flight details received.</p>;

  // Determine allowed seats based on user role
  const seatRows = 6;
  const seatCols = ['A', 'B', 'C', 'D'];
  // Ensure user.role_id is accessible and is a number
  const userRoleId = typeof user.role_id === 'number' ? user.role_id : null;
  const allowedRows = userRoleId === 1 ? [1, 2] : // Manager rows
                      userRoleId !== null ? [3, 4, 5, 6] : // Employee rows (if role exists)
                      []; // Default to no rows allowed if role is missing/invalid

  const renderSeatMap = () => {
    return Array.from({ length: seatRows }, (_, i) => {
      const row = i + 1;
      return (
        <div key={row} className="seats-pg-seat-row">
          {seatCols.map(col => {
            const id = `${row}${col}`;
            const allowed = allowedRows.includes(row);
            const selected = selectedSeat === id;
            return (
              <button
                key={id}
                className={`seats-pg-seat-button ${selected ? 'selected' : allowed ? 'allowed' : 'disallowed'}`}
                onClick={() => allowed && setSelectedSeat(id)}
                disabled={!allowed} // Disable button if seat is not allowed
                aria-label={`Seat ${id}${allowed ? '' : ' (Disallowed)'}${selected ? ' (Selected)' : ''}`} // Accessibility
              >
                {id}
              </button>
            );
          })}
        </div>
      );
    });
  };

  const handleProceedToVisa = () => {
    // Check all conditions: seat selected, flight details exist, game not active OR game won
    if (!selectedSeat || !flightDetails || (hasUserStartedGame && !hasGameBeenWon)) return;

    console.log("Proceeding to Visa Upload...");
    setIsGameActive(false); // Ensure game state is inactive
    clearTimeout(spawnTimeoutRef.current); // Explicitly clear timer just in case

    // Prepare data for the next step
    const bookingData = {
        employee_id: user?.id, // Use safe navigation
        flight_id: flightDetails.id,
        seat_number: selectedSeat,
        origin: flightOrigin,
        destination: flightDestination,
        airline: flightAirline,
        departure_time: departureDateTime, // Pass ISO string
        arrival_time: arrivalDateTime,     // Pass ISO string
        price: flightDetails.price,
        travel_date: selectedDate,          // "YYYY-MM-DD" string
    };

    console.log("BookingData object created:", bookingData); // <-- Check the final object!

    // Filter out undefined values if necessary before navigating
    // const cleanBookingData = Object.fromEntries(Object.entries(bookingData).filter(([_, v]) => v !== undefined));

    navigate('/upload-visa', {
      state: {
        user, // Pass the user object along
        pendingBooking: bookingData // Pass the structured booking data
      }
    });
  };

  // Determine if the proceed button should be disabled
  const proceedDisabled = !selectedSeat || !flightDetails || (hasUserStartedGame && !hasGameBeenWon);

  return (
    <div className="seats-pg-body">
      {/* --- Game UI: Rendered only if game has started --- */}
      {hasUserStartedGame && (
        <>
          {/* Container for falling items */}
          <div className="seats-pg-falling-items-container">
            {fallingItems.map(item => (
              <div
                key={item.id}
                draggable={isGameActive && !hasGameBeenWon} // Only draggable if game active & not won
                onDragStart={(e) => handleDragStart(e, item.id, item.src)}
                onDragEnd={handleDragEnd}
                className="seats-pg-falling-item"
                style={{
                  backgroundImage: `url(${item.src})`,
                  left: `${item.left}%`,
                  animationDuration: `${item.duration}ms`,
                  // Adjust cursor and opacity based on game state
                  cursor: (isGameActive && !hasGameBeenWon) ? 'grab' : 'default',
                  opacity: (isGameActive && !hasGameBeenWon) ? 1 : 0.6,
                }}
                aria-label="Falling item" // Accessibility
              />
            ))}
          </div>

          {/* Container for the drop queue */}
          <div
            className={`
                seats-pg-game-queue-container
                ${isDraggingOverQueue ? 'drag-over' : ''}
                ${incorrectDropFlash ? 'incorrect-drop' : ''}
                ${hasGameBeenWon ? 'game-won' : ''}
             `}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
            aria-label={`Game Queue: Drop target area. ${correctlyQueued.length} of ${GAME_QUEUE_TARGET} items correct.`} // Accessibility
          >
            <h4>
                Queue: {correctlyQueued.length}/{GAME_QUEUE_TARGET}
                {hasGameBeenWon && " (Completed!)"}
                {/* Incorrect flash message is handled by class styling */}
            </h4>
            <div className="seats-pg-game-queue">
              {/* Render correctly queued items */}
              {correctlyQueued.map((item, idx) => (
                <div key={`correct-${item.id}-${idx}`} className="seats-pg-queued-item" style={{ backgroundImage: `url(${item.src})` }} aria-label={`Queued item ${idx + 1}`} />
              ))}
              {/* Render placeholder slots */}
              {Array.from({ length: Math.max(0, GAME_QUEUE_TARGET - correctlyQueued.length) }).map((_, i) => (
                <div key={`placeholder-${i}`} className="seats-pg-queued-item placeholder" aria-label={`Empty queue slot ${correctlyQueued.length + i + 1}`} />
              ))}
            </div>
          </div>
        </>
      )}
      {/* --- End Game UI --- */}


      {/* --- Main Seat Selection Content --- */}
      <div className="seats-pg-container">
        <h3 className="seats-pg-header">Choose Your Seat</h3>
        <p className="seats-pg-flight-info">
          {/* Use derived flight details */}
          <strong>Flight:</strong> {flightAirline || 'N/A'} | {flightOrigin || 'N/A'} ➜ {flightDestination || 'N/A'}
          <br /> {/* Add line break for clarity */}
          <strong>Date:</strong> {selectedDate || 'N/A'}
        </p>

        {/* Show start game button only if game hasn't started */}
        {!hasUserStartedGame && (
          <button onClick={startGame} className="seats-pg-start-game-button">
            Play Optional Queue Game?
          </button>
        )}

        {/* Render the seat map */}
        {renderSeatMap()}

        {/* Proceed Button */}
        <button
          className="seats-pg-proceed-button"
          onClick={handleProceedToVisa}
          disabled={proceedDisabled}
        >
          Proceed to Upload Visa
        </button>

        {/* Feedback messages for the user */}
        {proceedDisabled && hasUserStartedGame && !hasGameBeenWon && !incorrectDropFlash && (
            <p className="seats-pg-warning-message">Complete the queue game to proceed, or refresh to skip/retry.</p>
        )}
         {proceedDisabled && !selectedSeat && (
            <p className="seats-pg-warning-message">Please select an available seat.</p>
        )}
      </div>
      {/* --- End Main Content --- */}
    </div>
  );
}

export default Seats;