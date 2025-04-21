import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
} from 'chart.js';

// Import the CSS file
import './Dashboard.css';

// Register the components ChartJS needs
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
);

const Dashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const user = location.state?.user;

  useEffect(() => {
    setError('');
    setAnalytics(null);

    if (user && user.company && user.company.id) {
      const companyId = user.company.id;
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';

      axios.get(`${apiUrl}/api/booking-analytics?company_id=${companyId}`)
        .then(response => {
          if (response.data && typeof response.data === 'object') {
             // Add basic validation if needed (e.g., check for expected arrays)
             if (!response.data.bookings_per_airline) response.data.bookings_per_airline = [];
             if (!response.data.bookings_over_time) response.data.bookings_over_time = [];
             if (!response.data.top_destinations) response.data.top_destinations = [];
             setAnalytics(response.data);
          } else {
              setError("No analytics data found or data format is incorrect.");
              setAnalytics({ // Set empty structure to avoid render errors
                  bookings_per_airline: [],
                  bookings_over_time: [],
                  top_destinations: []
              });
          }
        })
        .catch(err => {
          console.error('Error fetching analytics:', err);
          let errorMessage = "An unexpected error occurred while fetching analytics.";
          if (err.response) {
             errorMessage = `Failed to load analytics: ${err.response.data?.message || err.response.statusText || `Status ${err.response.status}`}`;
          } else if (err.request) {
             errorMessage = "Network error: Could not reach analytics server. Please check your connection.";
          }
          setError(errorMessage);
           setAnalytics({ // Set empty structure on error too
               bookings_per_airline: [],
               bookings_over_time: [],
               top_destinations: []
           });
        });
    } else {
       console.error("Dashboard: User or company ID not found in location state.");
       setError("User data not available. Cannot load dashboard.");
       // Optional: Redirect back to login after a delay
       // setTimeout(() => navigate('/'), 3000);
    }
  }, [user, navigate]); // Keep navigate if used in timeout etc.

  // --- Render Logic ---

  // Handle missing user data explicitly (Before loading/error checks for analytics)
  if (!user || !user.company || !user.company.id) {
      return (
          <div className="dashboard-message error-message">
              <h2>Error</h2>
              <p>{error || "User or Company information is missing. Please log in again."}</p>
               <button
                   onClick={() => navigate('/')}
                   className="button-primary" // Use a common button style if you have one
                >
                   Go to Login
               </button>
          </div>
      );
  }

  // Show loading state (only if analytics is null AND no error)
  if (analytics === null && !error) {
      return (
          <div className="dashboard-message loading-message">
              Loading analytics for {user.company.name}...
          </div>
      );
  }

  // Show error state (if error is set, takes precedence over empty data)
  if (error) {
       return (
          <div className="dashboard-message error-message">
              <h2>Error Loading Dashboard</h2>
              <p>{error}</p>
              {/* Optionally add a retry button or more specific guidance */}
          </div>
       );
  }

  // At this point, analytics is an object (potentially with empty arrays), and no error string is set.
  const hasAirlineData = analytics.bookings_per_airline && analytics.bookings_per_airline.length > 0;
  const hasTimeData = analytics.bookings_over_time && analytics.bookings_over_time.length > 0;
  const hasDestinationData = analytics.top_destinations && analytics.top_destinations.length > 0;

  // Prepare Chart Data (safe now)
  const barData = {
    labels: analytics.bookings_per_airline.map(item => item.airline),
    datasets: [{
      label: 'Total Bookings',
      data: analytics.bookings_per_airline.map(item => item.total),
      backgroundColor: 'rgba(54, 162, 235, 0.7)', // Blue
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1,
      borderRadius: 4, // Slightly rounded bars
    }]
  };

  const lineData = {
    labels: analytics.bookings_over_time.map(item => item.date), // Assuming date is formatted nicely
    datasets: [{
      label: 'Daily Bookings (Last 30 Days)',
      data: analytics.bookings_over_time.map(item => item.total),
      fill: true, // Fill area under line
      backgroundColor: 'rgba(75, 192, 192, 0.2)', // Teal fill
      borderColor: 'rgba(75, 192, 192, 1)', // Teal line
      tension: 0.3, // Smoother curve
      pointBackgroundColor: 'rgba(75, 192, 192, 1)',
      pointBorderColor: '#fff',
      pointHoverRadius: 7,
      pointHoverBackgroundColor: 'rgba(75, 192, 192, 1)',
    }]
  };

  const pieData = {
    labels: analytics.top_destinations.map(item => item.destination),
    datasets: [{
      label: 'Top Destinations',
      data: analytics.top_destinations.map(item => item.total),
      backgroundColor: [
        'rgba(255, 99, 132, 0.7)', // Red
        'rgba(255, 159, 64, 0.7)', // Orange
        'rgba(255, 205, 86, 0.7)', // Yellow
        'rgba(75, 192, 192, 0.7)', // Teal
        'rgba(153, 102, 255, 0.7)', // Purple
        'rgba(201, 203, 207, 0.7)' // Grey
      ],
      borderColor: [ // White borders for separation
        '#FFFFFF',
        '#FFFFFF',
        '#FFFFFF',
        '#FFFFFF',
        '#FFFFFF',
        '#FFFFFF',
       ],
      borderWidth: 2,
      hoverOffset: 8 // Slightly enlarges slice on hover
    }]
  };

  // Base Chart options
  const baseChartOptions = {
      responsive: true,
      maintainAspectRatio: false, // Important for fitting charts in fixed height containers
      plugins: {
          legend: {
              position: 'bottom', // Position legend at the bottom
              labels: {
                  padding: 20, // Add padding to legend items
                  boxWidth: 12,
                  font: {
                      size: 13,
                  }
              }
          },
          title: {
              display: false, // We use the card title
          },
          tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleFont: { size: 14 },
              bodyFont: { size: 12 },
              padding: 10,
              cornerRadius: 4,
              displayColors: true, // Show color boxes in tooltip
          }
      },
      scales: { // Add basic scale styling
        x: {
            grid: {
                display: false // Hide vertical grid lines
            },
            ticks: {
                font: { size: 11 }
            }
        },
        y: {
            grid: {
                color: 'rgba(200, 200, 200, 0.3)' // Lighter horizontal grid lines
            },
            ticks: {
                font: { size: 11 }
            },
            beginAtZero: true // Ensure Y axis starts at 0
        }
      }
  };

   // Specific options for Pie chart (e.g., legend position)
   const pieOptions = {
      ...baseChartOptions,
       plugins: {
            ...baseChartOptions.plugins, // Inherit base plugins config
            legend: { // Override legend position for Pie
              position: 'right',
              labels: {
                    ...baseChartOptions.plugins.legend.labels, // Inherit label styles
                    boxWidth: 15, // Slightly larger box for pie legend
              }
            },
       },
       scales: {} // Pie chart doesn't use scales
   };


  return (
    <div className="dashboard-container">
      <h1 className="dashboard-header">
          Booking Analytics: {user.company.name}
      </h1>

      <div className="dashboard-grid">

        {/* Card 1: Bookings per Airline */}
        <div className="dashboard-card">
          <h3 className="card-title">Bookings per Airline</h3>
          <div className="chart-container">
            {hasAirlineData ? (
                <Bar options={baseChartOptions} data={barData} />
            ) : (
              <p className="no-data-message">No booking data found for airlines.</p>
            )}
          </div>
        </div>

        {/* Card 2: Bookings Over Time */}
        <div className="dashboard-card">
          <h3 className="card-title">Bookings Over Time (Last 30 Days)</h3>
           <div className="chart-container">
            {hasTimeData ? (
                <Line options={baseChartOptions} data={lineData} />
             ) : (
               <p className="no-data-message">No recent booking data found.</p>
             )}
           </div>
        </div>

        {/* Card 3: Top Destinations (Spans full width on larger screens via grid CSS) */}
        <div className="dashboard-card full-width-card">
          <h3 className="card-title">Top 5 Destinations</h3>
           <div className="chart-container pie-chart-container"> {/* Special class for Pie */}
            {hasDestinationData ? (
                // The Pie component itself will center if maintainAspectRatio is false
                <Pie options={pieOptions} data={pieData} />
             ) : (
               <p className="no-data-message">No destination data found.</p>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;