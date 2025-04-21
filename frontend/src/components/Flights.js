// src/components/Flights.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Flights.css'; // We'll create this new CSS file

// --- Constants ---
const SNOWFLAKE_SRC = '/images/snowflake_615669.png';
const SNOWBALL_SRC = '/images/snowball.png';
const SNOWMAN_SRCS = ['/images/cold_13792674.png', '/images/snowman_2469233.png'];
const TARGET_SRC = '/images/target_610064.png';

// --- Physics Adjustments ---
const GRAVITY = 0.01;
const SNOWFLAKE_COMBINE_DIST = 25;
const SNOWBALL_COMBINE_DIST = 35;
const TARGET_HIT_DIST = 40;
const INTERACTION_RADIUS = 130;
const MOUSE_PUSH_FORCE = 0.25;
const SNOWBALL_PICKUP_DIST = 30;
const SNOWBALL_THROW_SPEED = 7;

// --- API Configuration ---
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const FLIGHTS_API_ENDPOINT = `${API_BASE_URL}/api/flights`;

// --- Helper ---
const getRandom = (min, max) => Math.random() * (max - min) + min;
const distSq = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

function Flights() {
  const location = useLocation();
  const navigate = useNavigate();
  // Receive user from previous route (Login)
  const user = location.state?.user;
  const [originalFlights, setOriginalFlights] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [fetchError, setFetchError] = useState('');

  // --- Interactive Elements State ---
  const [elements, setElements] = useState([]);
  const [target, setTarget] = useState({ x: 150, y: 100, vx: 1.2, size: 60, isHit: false, hitTime: 0 });
  const [heldElement, setHeldElement] = useState(null);
  const containerRef = useRef(null);
  const mousePos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const animationFrameId = useRef(null);

  // --- Data Fetching ---
   useEffect(() => {
     let isMounted = true;
     setFetchError('');

     if (user?.company?.id) {
       const url = `${FLIGHTS_API_ENDPOINT}?company_id=${user.company.id}`;
       fetch(url)
         .then((res) => {
             if (!res.ok) { throw new Error(`Failed to fetch flights: ${res.status}`); }
             return res.json();
         })
         .then((data) => {
           if (isMounted) {
               if (Array.isArray(data)) {
                     setOriginalFlights(data);
                     const uniqueAirlines = [...new Set(data.map((f) => f.airline))].sort();
                     setAirlines(uniqueAirlines);
               } else {
                    console.error("Error fetching flights: Received non-array data", data);
                    setFetchError("Received invalid flight data from server.");
                    setOriginalFlights([]); setAirlines([]);
               }
           }
         })
         .catch((err) => {
             console.error("Error fetching flights:", err);
             if (isMounted) {
                 setFetchError(err.message || "Could not connect to fetch flights.");
                 setOriginalFlights([]); setAirlines([]);
             }
         });
     } else {
         setFetchError("User or Company information missing. Cannot fetch flights.");
         // Optional: Redirect if user data is absolutely required and missing
         // if (!user && location.pathname !== '/') navigate('/');
     }
      // Cleanup function
      return () => { isMounted = false; };
   // Only re-run if the user object changes. Add navigate if used inside effect.
   }, [user]);


  // --- Element Creation ---
  const createElement = useCallback((type, initialProps = {}) => {
    if (!containerRef.current) return null;
    const containerWidth = containerRef.current.offsetWidth;
    const baseProps = {
      id: Date.now() + Math.random(), type: type, x: getRandom(0, containerWidth), y: -60,
      vx: getRandom(-0.2, 0.2), vy: getRandom(0.05, 0.3), rotation: getRandom(0, 360),
      rotationSpeed: getRandom(-0.5, 0.5), opacity: 1, isThrown: false, createdAt: Date.now(), ...initialProps,
    };
    switch (type) {
      case 'snowflake': return { ...baseProps, src: SNOWFLAKE_SRC, size: getRandom(15, 25) };
      case 'snowball': return { ...baseProps, src: SNOWBALL_SRC, size: getRandom(25, 35), vy: getRandom(0.3, 0.6) };
      case 'snowman': return { ...baseProps, src: SNOWMAN_SRCS[Math.floor(Math.random() * SNOWMAN_SRCS.length)], size: getRandom(45, 60), vy: 0, vx: 0, rotationSpeed: 0, isStatic: true };
      default: return null;
    }
  }, []); // Empty dependency array as it doesn't depend on changing state/props

  const addSnowflake = useCallback(() => {
    const newFlake = createElement('snowflake');
    if (newFlake) setElements((prev) => [...prev, newFlake]);
  }, [createElement]);


  // --- Collision and Combination Logic ---
  const handleCollisions = (currentElements) => {
    let newElements = [...currentElements];
    const combinedIds = new Set();

    // Snowflake -> Snowball
    for (let i = 0; i < newElements.length; i++) {
      if (combinedIds.has(newElements[i].id) || newElements[i].type !== 'snowflake') continue;
      for (let j = i + 1; j < newElements.length; j++) {
        if (combinedIds.has(newElements[j].id) || newElements[j].type !== 'snowflake') continue;
        const dSq = distSq(newElements[i].x, newElements[i].y, newElements[j].x, newElements[j].y);
        if (dSq < SNOWFLAKE_COMBINE_DIST ** 2) {
          const newSnowball = createElement('snowball', {
             x: (newElements[i].x + newElements[j].x) / 2, y: (newElements[i].y + newElements[j].y) / 2,
             vx: (newElements[i].vx + newElements[j].vx) / 2, vy: (newElements[i].vy + newElements[j].vy) / 2,
          });
          if (newSnowball) { newElements.push(newSnowball); combinedIds.add(newElements[i].id); combinedIds.add(newElements[j].id); break; }
        }
      }
    }
    // Snowball -> Snowman
    for (let i = 0; i < newElements.length; i++) {
      if (combinedIds.has(newElements[i].id) || newElements[i].type !== 'snowball' || newElements[i].isThrown) continue;
      for (let j = i + 1; j < newElements.length; j++) {
         if (combinedIds.has(newElements[j].id) || newElements[j].type !== 'snowball' || newElements[j].isThrown) continue;
         const dSq = distSq(newElements[i].x, newElements[i].y, newElements[j].x, newElements[j].y);
         if (dSq < SNOWBALL_COMBINE_DIST ** 2) {
           const newSnowman = createElement('snowman', { x: (newElements[i].x + newElements[j].x) / 2, y: (newElements[i].y + newElements[j].y) / 2 });
           if (newSnowman) { newElements.push(newSnowman); combinedIds.add(newElements[i].id); combinedIds.add(newElements[j].id); break; }
         }
      }
    }
    return newElements.filter(el => !combinedIds.has(el.id));
  }; // No changing dependencies needed for this calculation function

  // --- Target Logic ---
   const updateTarget = (currentTarget) => {
       if (!containerRef.current) return currentTarget;
       const containerWidth = containerRef.current.offsetWidth;
       let { x, y, vx, isHit, hitTime, size } = currentTarget;

       if (isHit) {
           if (Date.now() - hitTime > 800) { // Faster respawn
               return { ...currentTarget, isHit: false, x: getRandom(50, containerWidth - 100), y: getRandom(50, 150), size: 60 };
           } else {
                // Shrink faster
                return {...currentTarget, size: size * 0.95};
           }
       }
       let nextX = x + vx;
       if (nextX <= 0 || nextX >= containerWidth - size) {
           vx = -vx; nextX = x + vx;
       }
       return { ...currentTarget, x: nextX, vx: vx };
   }; // Depends on getRandom, but typically stable

  // --- Main Animation Loop ---
  const animateElements = useCallback(() => {
      if (!containerRef.current) {
          // If container not ready, request next frame and exit
          animationFrameId.current = requestAnimationFrame(animateElements);
          return;
      }
      const containerWidth = containerRef.current.offsetWidth;
      const containerHeight = window.innerHeight;

      // 1. Update Target
      setTarget(prevTarget => updateTarget(prevTarget));

      // 2. Update Elements
      setElements((prevElements) => {
        let updatedElements = prevElements
          .map((el) => {
            // Skip held element physics
            if (heldElement && heldElement.id === el.id) return el;

            // Mouse Interaction (Push)
            let forceX = 0; let forceY = 0;
            if ((el.type === 'snowflake' || (el.type === 'snowball' && !el.isThrown)) && !el.isStatic) {
                 const dx = el.x + el.size / 2 - mousePos.current.x;
                 const dy = el.y + el.size / 2 - mousePos.current.y;
                 const dist = Math.sqrt(dx * dx + dy * dy);
                 if (dist < INTERACTION_RADIUS && dist > 0) {
                     const force = (1 - dist / INTERACTION_RADIUS) * MOUSE_PUSH_FORCE;
                     forceX = (dx / dist) * force; forceY = (dy / dist) * force;
                 }
            }

            // Apply Physics
            let nextVx = el.vx * 0.99 + forceX; let nextVy = el.vy * 0.99 + forceY;
            if (!el.isStatic && !el.isThrown) { nextVy += GRAVITY; }
            let nextX = el.x + nextVx; let nextY = el.y + nextVy; let nextRotation = el.rotation + el.rotationSpeed;

             // Target Hit Check
             if (el.type === 'snowball' && el.isThrown && !target.isHit) {
                const targetCenterX = target.x + target.size / 2; const targetCenterY = target.y + target.size / 2;
                const ballCenterX = nextX + el.size / 2; const ballCenterY = nextY + el.size / 2;
                const dSq = distSq(ballCenterX, ballCenterY, targetCenterX, targetCenterY);
                if (dSq < ((target.size * 0.4) + (el.size * 0.4))**2 ) {
                     setTarget(t => ({ ...t, isHit: true, hitTime: Date.now() })); return null;
                 }
             }

            // Remove if off-screen
            if (nextY > containerHeight + el.size || nextX < -el.size || nextX > containerWidth + el.size) return null;

            return { ...el, x: nextX, y: nextY, vx: nextVx, vy: nextVy, rotation: nextRotation };
          })
          .filter(Boolean);

          // 3. Handle Collisions / Combinations
          updatedElements = handleCollisions(updatedElements);

          return updatedElements;
      });

      // Request the next frame
      animationFrameId.current = requestAnimationFrame(animateElements);
  // Dependencies: Include functions/state used inside
  }, [handleCollisions, heldElement, target.isHit, target.x, target.y, target.size, updateTarget]);

  // --- Mouse Event Handlers ---
   const handleMouseDown = useCallback((event) => {
        const clickX = event.clientX; const clickY = event.clientY;
        let clickedSnowball = null; let minDistSq = SNOWBALL_PICKUP_DIST ** 2;
        // Access elements directly from state within the callback
        setElements(currentElements => {
            currentElements.forEach(el => {
                if (el.type === 'snowball' && !el.isThrown) {
                    const dSq = distSq(clickX, clickY, el.x + el.size / 2, el.y + el.size / 2);
                    if (dSq < minDistSq) { minDistSq = dSq; clickedSnowball = el; }
                }
            });
            if (clickedSnowball) {
                setHeldElement({
                    id: clickedSnowball.id, type: 'snowball',
                    offsetX: clickX - (clickedSnowball.x + clickedSnowball.size / 2),
                    offsetY: clickY - (clickedSnowball.y + clickedSnowball.size / 2),
                });
                // Return new state with held element moved to end
                return [ ...currentElements.filter(el => el.id !== clickedSnowball.id), clickedSnowball ];
            }
            // Return unchanged state if no snowball clicked
            return currentElements;
        });
   }, []); // Depends only on setElements, setHeldElement

   const handleMouseMove = useCallback((event) => {
       const currentX = event.clientX; const currentY = event.clientY;
       mousePos.current = { x: currentX, y: currentY };
       if (heldElement) {
           setElements(prevElements => prevElements.map(el => {
               if (el.id === heldElement.id) {
                   return { ...el, x: currentX - heldElement.offsetX - el.size / 2, y: currentY - heldElement.offsetY - el.size / 2, vx: 0, vy: 0 };
               } return el;
           }));
       }
   }, [heldElement]); // Depends on heldElement

   const handleMouseUp = useCallback((event) => {
       if (heldElement) {
           // Use functional update for setElements to get the latest state
           setElements(currentElements => {
                const thrownElement = currentElements.find(el => el.id === heldElement.id);
                if (thrownElement) {
                    const aimX = target.x + target.size / 2; const aimY = target.y + target.size / 2;
                    const throwDx = aimX - (thrownElement.x + thrownElement.size / 2);
                    const throwDy = aimY - (thrownElement.y + thrownElement.size / 2);
                    const throwDist = Math.sqrt(throwDx*throwDx + throwDy*throwDy);
                    const speed = SNOWBALL_THROW_SPEED;
                    const throwVx = throwDist > 0 ? (throwDx / throwDist) * speed : 0;
                    const throwVy = throwDist > 0 ? (throwDy / throwDist) * speed : 0;
                    // Return the updated elements array
                    return currentElements.map(el =>
                        el.id === heldElement.id ? { ...el, isThrown: true, vx: throwVx, vy: throwVy } : el
                    );
                }
                // Return unchanged state if thrownElement wasn't found (shouldn't happen)
                return currentElements;
            });
           setHeldElement(null); // Clear held element regardless
       }
   // Dependencies: Include state/props/refs used inside
   }, [heldElement, target.x, target.y, target.size]);


  // --- Effects ---
  useEffect(() => { // Create initial snowflakes
    for (let i = 0; i < 10; i++) {
        const flake = createElement('snowflake', {y: getRandom(0, window.innerHeight * 0.7)});
        if(flake) setElements(prev => [...prev, flake]);
    }
    const intervalId = setInterval(addSnowflake, 1200);
    return () => clearInterval(intervalId);
  }, [addSnowflake, createElement]); // Correct dependencies

  useEffect(() => { // Animation loop
    animationFrameId.current = requestAnimationFrame(animateElements);
    // Cleanup function
    return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
  }, [animateElements]); // Correct dependency

   useEffect(() => { // Mouse listeners
       window.addEventListener('mousedown', handleMouseDown);
       window.addEventListener('mousemove', handleMouseMove);
       window.addEventListener('mouseup', handleMouseUp);
       // Cleanup function
       return () => {
           window.removeEventListener('mousedown', handleMouseDown);
           window.removeEventListener('mousemove', handleMouseMove);
           window.removeEventListener('mouseup', handleMouseUp);
       };
   }, [handleMouseDown, handleMouseMove, handleMouseUp]); // Correct dependencies


  // --- UI Handlers ---
  const handleAirlineClick = (airline) => {
    // Ensure user data exists before navigating
    if (!user) {
        console.error("Cannot navigate: user data missing.");
        setFetchError("User data missing, cannot proceed.");
        return;
    }
    const flightsForAirline = originalFlights.filter(f => f.airline === airline);
    // ***** CHANGE IS HERE *****
    // Pass the 'user' object along in the navigation state
    navigate('/locations', {
        state: {
            airline,
            flights: flightsForAirline,
            user: user // Pass the received user object along
        }
    });
    // *************************
  };

  const handleDashboardClick = () => {
     // Ensure user data exists before navigating
     if (!user) {
         console.error("Cannot navigate: user data missing.");
         setFetchError("User data missing, cannot proceed.");
         return;
     }
    // ***** CHANGE IS HERE *****
    // Ensure the 'user' object is passed in the navigation state
    navigate('/dashboard', {
        state: {
            user: user // Pass the received user object along
        }
    });
    // *************************
  };

  // --- Render ---
  return (
    <div className="flights-page-wrapper winter-theme" ref={containerRef}>
      {/* Animated elements container */}
      <div className="winter-elements-container">
        <img
          src={TARGET_SRC}
          alt="Target"
          className={`winter-target ${target.isHit ? 'hit' : ''}`}
          style={{ left: `${target.x}px`, top: `${target.y}px`, width: `${target.size}px`, height: `${target.size}px` }}
        />
        {elements.map((el) => (
          <img
            key={el.id}
            src={el.src}
            alt={el.type}
            className={`winter-element ${el.type} ${heldElement?.id === el.id ? 'held' : ''}`}
            style={{
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${el.size}px`,
                height: `${el.size}px`,
                transform: `rotate(${el.rotation}deg)`,
                opacity: el.opacity,
                zIndex: heldElement?.id === el.id ? 15 : (el.type === 'snowball' ? 10 : 5)
            }}
          />
        ))}
      </div>

      {/* UI Elements */}
      <div className="flights-ui-overlay">
        {fetchError && <p className="error-message" style={{color: 'red', backgroundColor: 'lightpink', padding: '10px', borderRadius: '5px'}}>Error: {fetchError}</p>}

        {/* Use optional chaining for safe access */}
        <h3>Flights for <strong>{user?.company?.name || "Your Company"}</strong></h3>

        <div className="flights-buttons-container">
          {/* Disable button if user data is missing */}
          <button onClick={handleDashboardClick} className="flights-button dashboard" disabled={!user}>📊 Go to Dashboard</button>
          <h4>Select an Airline:</h4>
          <div className="airline-buttons">
            {/* Loading/Empty state handling */}
            {!fetchError && airlines.length === 0 && !originalFlights.length && <p>Loading airlines...</p> }
            {/* Airline buttons */}
            {airlines.length > 0 && airlines.map((airline, index) => (
                <button
                    key={index}
                    onClick={() => handleAirlineClick(airline)}
                    className="flights-button airline"
                    disabled={!user} // Disable if user info is missing
                >
                    {airline}
                </button>
             ))}
             {/* Message if flights loaded but no airlines found */}
             {!fetchError && airlines.length === 0 && originalFlights.length > 0 && <p>No airlines found for your company.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Flights;