// src/components/Login.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // We'll create this CSS file

// --- Icon Sources ---
// Make sure these paths match the files in your public/images folder
const iconSources = [
  '/images/umbrella_6944796.png',
  '/images/summer_5662876.png',
  '/images/drink_2738804.png',
  '/images/sea-waves_8856406.png',
];

// --- Helper Functions ---
const getRandom = (min, max) => Math.random() * (max - min) + min;

// --- API Configuration ---
// Read the API base URL from the environment variable set during build.
// Fallback to localhost:8080 for local development outside Docker or if .env is missing.
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
// Construct the specific login endpoint URL
const LOGIN_API_ENDPOINT = `${API_BASE_URL}/api/login`;


function Login() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(''); // <<<--- ADDED STATE for Phone Number
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // --- State for Falling Icons ---
  const [icons, setIcons] = useState([]);
  const containerRef = useRef(null); // Ref for the page wrapper
  const mousePos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const animationFrameId = useRef(null); // To store requestAnimationFrame ID

  // --- Icon Creation Logic ---
  const createIcon = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.offsetWidth;

    setIcons((prevIcons) => [
      ...prevIcons,
      {
        id: Date.now() + Math.random(), // Unique ID
        src: iconSources[Math.floor(Math.random() * iconSources.length)],
        x: getRandom(0, containerWidth), // Start anywhere across the top
        y: -60, // Start above the screen
        vx: getRandom(-0.3, 0.3), // Slight horizontal drift (breeze)
        vy: getRandom(0.5, 1.5), // Vertical speed
        rotation: getRandom(0, 360),
        rotationSpeed: getRandom(-1, 1), // How fast it spins
        size: getRandom(30, 50), // Icon size in pixels
        opacity: 1,
      },
    ]);
  }, []); // Empty dependency array as it doesn't depend on changing state/props

  // --- Animation Loop ---
  const animateIcons = useCallback(() => {
    const containerHeight = window.innerHeight; // Use window height for boundary

    setIcons((prevIcons) =>
      prevIcons
        .map((icon) => {
          // --- Mouse Interaction ---
          const dx = icon.x - mousePos.current.x;
          const dy = icon.y - mousePos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const interactionRadius = 150; // How close mouse needs to be
          let forceX = 0;
          let forceY = 0;

          if (dist < interactionRadius && dist > 0) { // avoid division by zero if dist is 0
            const force = (1 - dist / interactionRadius) * 0.05; // Push force, stronger when closer
            forceX = (dx / dist) * force;
            forceY = (dy / dist) * force;
          }

          // --- Update Position & Rotation ---
          let nextX = icon.x + icon.vx + forceX * 50; // Apply breeze + mouse force
          let nextY = icon.y + icon.vy + forceY * 50; // Apply gravity + mouse force (vy increases naturally if gravity added later)
          let nextRotation = icon.rotation + icon.rotationSpeed;

          // --- Remove if far below screen ---
          if (nextY > containerHeight + icon.size) {
            return null; // Mark for removal
          }

          return {
            ...icon,
            x: nextX,
            y: nextY,
            rotation: nextRotation,
             vx: icon.vx * 0.99 + forceX * 0.5, // Dampen breeze slightly, add mouse push
             vy: icon.vy + forceY * 0.5, // Keeping original logic (no explicit gravity here)
          };
        })
        .filter(Boolean) // Remove null entries (icons that went off screen)
    );

    animationFrameId.current = requestAnimationFrame(animateIcons);
  }, []); // Empty dependency array for useCallback

  // --- Effects ---
  // Create icons periodically
  useEffect(() => {
    const intervalId = setInterval(createIcon, 500); // Add a new icon every 500ms
    return () => clearInterval(intervalId); // Cleanup interval
  }, [createIcon]);

  // Start/Stop animation loop
  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(animateIcons);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current); // Cleanup animation frame
      }
    };
  }, [animateIcons]);

  // Mouse position listener
  useEffect(() => {
    const handleMouseMove = (event) => {
      mousePos.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove); // Cleanup listener
    };
  }, []);

  // --- Form Submit Logic ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(LOGIN_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ***** MODIFICATION HERE *****
        // Include phoneNumber in the request body
        body: JSON.stringify({ companyName, email, name, phoneNumber }),
        // ***************************
      });
      // Check if the response was successful, otherwise throw an error
      if (!response.ok) {
          // Try to get error message from backend, otherwise use default
          let errorMsg = `Login failed with status: ${response.status}`;
          try {
              const errorData = await response.json();
              errorMsg = errorData.message || errorMsg;
          } catch (jsonError) {
              // Ignore if response isn't valid JSON
              console.error("Could not parse error response JSON:", jsonError);
          }
          throw new Error(errorMsg);
      }

      const data = await response.json();

      // Assuming backend returns success status consistently in JSON body
      // AND that the backend now includes the phone number (if needed) in the employee object
      if (data.status === 'success' && data.employee) {
        // Pass the entire employee object (potentially including phone number) to the next route
        navigate('/flights', { state: { user: data.employee } });
      } else {
        // If status isn't 'success' or employee data is missing, treat as error
        setError(data.message || 'Login failed: Invalid response from server.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      // Display the error message thrown or caught
      setError(err.message || 'An network error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper" ref={containerRef}>
      {/* Container for falling icons (behind the form) */}
      <div className="falling-icons-container">
        {icons.map((icon) => (
          <img
            key={icon.id}
            src={icon.src}
            alt="" // Decorative images don't need alt text
            className="falling-icon"
            style={{
              left: `${icon.x}px`,
              top: `${icon.y}px`,
              width: `${icon.size}px`,
              height: `${icon.size}px`,
              transform: `rotate(${icon.rotation}deg)`,
              opacity: icon.opacity,
            }}
          />
        ))}
      </div>

      {/* The Login Form Container (on top) */}
      <div className="login-container-overlay">
        <h2>Beach Travel Login</h2>
        <form onSubmit={handleSubmit}>
          {/* Inputs with labels for better accessibility and style */}
          <div className="input-wrapper">
            <input
              id="companyName"
              type="text"
              placeholder=" " // Required for floating label CSS trick
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              disabled={isLoading}
            />
            <label htmlFor="companyName">Company Name</label>
          </div>
          <div className="input-wrapper">
            <input
              id="name"
              type="text"
              placeholder=" "
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
            />
            <label htmlFor="name">Your Full Name</label>
          </div>
          <div className="input-wrapper">
            <input
              id="email"
              type="email"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
            <label htmlFor="email">Your Company Email</label>
          </div>

          {/* --- ADDED PHONE NUMBER FIELD --- */}
          <div className="input-wrapper">
            <input
              id="phoneNumber"
              type="tel" // Use type="tel" for phone numbers
              placeholder=" "
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required // Make it required if necessary
              disabled={isLoading}
              // You might add pattern validation later if needed:
              // pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
            />
            <label htmlFor="phoneNumber">Phone Number</label>
          </div>
          {/* ------------------------------- */}


          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default Login;