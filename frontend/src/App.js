// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Flights from './components/Flights';
import Locations from './components/Locations';
import Seats from './components/Seats';
import UploadVisa from './components/UploadVisa';
import Dashboard from './components/Dashboard';
import Insurance from './components/Insurance';
import AcceptInsurance from './components/AcceptInsurance'; // <-- 1. Import the new component

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/flights" element={<Flights />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/seats" element={<Seats />} />
        <Route path="/upload-visa" element={<UploadVisa />} />
        <Route path="/insurance" element={<Insurance />} />
        <Route path="/accept-insurance" element={<AcceptInsurance />} /> {/* <-- 2. Add the new route */}
        <Route path="/dashboard" element={<Dashboard />} />
        {/* Add other routes as needed */}
      </Routes>
    </Router>
  );
}

export default App;