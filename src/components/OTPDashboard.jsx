import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { supabase } from "../lib/supabase";
import {
  RefreshCw,
  Loader,
  AlertCircle,
  Copy,
  CheckCircle,
  ChevronDown,
  Filter,
} from "lucide-react";
import "../styles/OTPDashboard.css";

const realtimeUrl =
  import.meta.env.VITE_REALTIME_URL || "http://localhost:3001";

const sortRows = (rows) =>
  [...rows].sort(
    (left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime(),
  );

const mergeRows = (rows) => {
  const rowMap = new Map();

  rows.forEach((row) => {
    rowMap.set(row.id, row);
  });

  return sortRows(Array.from(rowMap.values()));
};

export default function OTPDashboard() {
  const [otpData, setOtpData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [filter, setFilter] = useState("");
  const [selectedApp, setSelectedApp] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  async function fetchOTPData() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("otp_master")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;
      setOtpData(mergeRows(data || []));
    } catch (err) {
      setError(err.message);
      console.error("Error fetching OTP data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        void fetchOTPData();
      }
    });

    const socket = io(realtimeUrl, {
      transports: ["websocket"],
    });

    socket.on("otp_master:snapshot", (rows) => {
      setOtpData(mergeRows(Array.isArray(rows) ? rows : []));
      setLoading(false);
    });

    socket.on("connect_error", (socketError) => {
      console.error("Realtime socket connection failed:", socketError);
    });

    // Set up real-time subscription
    const subscription = supabase
      .channel("otp_master")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "otp_master" },
        (payload) => {
          if (!payload.new) {
            return;
          }

          setOtpData((prev) => mergeRows([payload.new, ...prev]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      socket.disconnect();
      supabase.removeChannel(subscription);
    };
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest(".app-filter-dropdown-container")) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [dropdownOpen]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const filteredData = otpData.filter((item) => {
    // App Filter
    if (selectedApp !== "all") {
      if (item.app_name?.toLowerCase() !== selectedApp.toLowerCase()) {
        return false;
      }
    }

    // Text Search Filter
    if (!filter) return true;
    return (
      item.app_name?.toLowerCase().includes(filter.toLowerCase()) ||
      item.phone?.includes(filter) ||
      item.otp?.toString().includes(filter)
    );
  });

  return (
    <div className="otp-dashboard">
      <div className="bg-shapes">
        <svg className="shape shape-1" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,15 90,85 10,85" stroke="rgba(129, 140, 248, 0.3)" strokeWidth="1.5" fill="rgba(129, 140, 248, 0.03)" />
        </svg>
        <svg className="shape shape-2" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,5 95,35 95,85 50,95 5,85 5,35" stroke="rgba(6, 182, 212, 0.25)" strokeWidth="1.5" fill="rgba(6, 182, 212, 0.02)" />
        </svg>
        <svg className="shape shape-3" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,5 90,50 50,95 10,50" stroke="rgba(236, 72, 153, 0.25)" strokeWidth="1.5" fill="rgba(236, 72, 153, 0.02)" />
        </svg>
        <div className="glow-blob glow-1"></div>
        <div className="glow-blob glow-2"></div>
        <div className="glow-blob glow-3"></div>
      </div>
      
      <div className="dashboard-header">
        <div className="header-content">
          <h1>OTP Dashboard</h1>
          <p>Real-time OTP monitoring and management</p>
        </div>
        <button
          className="refresh-btn"
          onClick={fetchOTPData}
          disabled={loading}
        >
          <RefreshCw size={20} className={loading ? "spinning" : ""} />
          Refresh
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-section">
          <input
            type="text"
            placeholder="Filter by app name, phone, or OTP..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
          {filter && (
            <span className="filter-badge">{filteredData.length} results</span>
          )}
        </div>

        <div className="app-filter-dropdown-container">
          <button 
            className={`dropdown-trigger-btn ${selectedApp !== "all" ? "active" : ""}`}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <Filter size={16} />
            <span>
              {selectedApp === "all" ? "All Apps" : selectedApp}
            </span>
            <ChevronDown size={16} className={`chevron-icon ${dropdownOpen ? "open" : ""}`} />
          </button>
          
          {dropdownOpen && (
            <div className="dropdown-menu-list">
              <button 
                className={`dropdown-item ${selectedApp === "all" ? "selected" : ""}`}
                onClick={() => { setSelectedApp("all"); setDropdownOpen(false); }}
              >
                All Apps
              </button>
              <button 
                className={`dropdown-item ${selectedApp === "lounge_owner" ? "selected" : ""}`}
                onClick={() => { setSelectedApp("lounge_owner"); setDropdownOpen(false); }}
              >
                lounge_owner
              </button>
              <button 
                className={`dropdown-item ${selectedApp === "driver_conductor" ? "selected" : ""}`}
                onClick={() => { setSelectedApp("driver_conductor"); setDropdownOpen(false); }}
              >
                driver_conductor
              </button>
              <button 
                className={`dropdown-item ${selectedApp === "passenger" ? "selected" : ""}`}
                onClick={() => { setSelectedApp("passenger"); setDropdownOpen(false); }}
              >
                passenger
              </button>
              <button 
                className={`dropdown-item ${selectedApp === "admin" ? "selected" : ""}`}
                onClick={() => { setSelectedApp("admin"); setDropdownOpen(false); }}
              >
                admin
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading && !otpData.length ? (
        <div className="loading-state">
          <Loader size={40} className="spinning" />
          <p>Loading OTP data...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={40} />
          <p>{filter ? "No results found" : "No OTP records yet"}</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-card">
            <div className="table-wrapper">
              <table className="otp-table">
                <thead>
                  <tr>
                    <th>OTP</th>
                    <th>Phone</th>
                    <th>App Name</th>
                    <th>Created At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row) => (
                    <tr key={row.id} className="table-row">
                      <td className="otp-cell">
                        <span className="otp-badge">{row.otp}</span>
                      </td>
                      <td className="phone-cell">{row.phone || "-"}</td>
                      <td className="app-cell">
                        <span className="app-badge">{row.app_name || "-"}</span>
                      </td>
                      <td className="date-cell">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="action-cell">
                        <button
                          className="copy-btn"
                          onClick={() => copyToClipboard(row.otp, row.id)}
                          title="Copy OTP"
                        >
                          {copiedId === row.id ? (
                            <CheckCircle size={18} className="check-icon" />
                          ) : (
                            <Copy size={18} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span className="record-count">
                Showing {filteredData.length} of {otpData.length} records
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
