import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { supabase } from "../lib/supabase";
import {
  RefreshCw,
  Loader,
  AlertCircle,
  Copy,
  CheckCircle,
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

  const filteredData = otpData.filter(
    (item) =>
      item.app_name?.toLowerCase().includes(filter.toLowerCase()) ||
      item.phone?.includes(filter) ||
      item.otp?.toString().includes(filter),
  );

  return (
    <div className="otp-dashboard">
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
